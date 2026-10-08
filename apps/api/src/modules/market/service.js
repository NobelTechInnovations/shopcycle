const crypto = require("crypto");
const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { detectImageType } = require("../../lib/file-type");
const { encryptSecret, decryptSecret } = require("../../lib/crypto");
const { storefrontUrl } = require("../../lib/storefront-url");
const themes = require("../themes/service");
const apiKeys = require("../developer/api-keys");
const { parseThemeZip, settingsDataOf } = require("./theme-package");

/**
 * Oyklane Store (oyklanestore.com): themes and apps — Oyklane's own and
 * developers' — free or paid.
 *
 *   Developers list them (draft → in review → approved), upload theme
 *   packages as versions, and earn MARKET_PARTNER_SHARE of each sale.
 *   Super admins review them.
 *   Sellers buy and install from their admin (where they're signed in):
 *   a paid theme needs a verified Razorpay payment; the licence is for
 *   that store only, and the installed copy is locked (settings only, the
 *   code can't be read or copied).
 *   Every theme previews on the demo store (MARKET_DEMO_STORE) — all its
 *   pages, with real products — without the theme's files ever leaving
 *   the server.
 */

const KINDS = ["theme", "app"];
const THEME_CATEGORIES = ["fashion", "food", "jewellery", "electronics", "beauty", "home", "general"];
const APP_CATEGORIES = ["marketing", "sales", "shipping", "reviews", "customer-support", "analytics", "store-design", "other"];
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const num = (v) => (v == null ? 0 : Number(v));

const slugify = (v) =>
  String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const mediaUrl = (id) => (id ? `${env.API_PUBLIC_URL}/api/market/media/${id}` : null);

// ── Demo store (previews) ─────────────────────────────────────────

let demoCache = null;
async function demoStore(prisma) {
  if (demoCache && demoCache.at > Date.now() - 60_000) return demoCache.store;
  const store = await prisma.store.findUnique({ where: { handle: env.MARKET_DEMO_STORE } });
  demoCache = { store, at: Date.now() };
  return store;
}

/** Links into the demo store for the preview's page switcher. */
async function previewPages(prisma) {
  const store = await demoStore(prisma);
  if (!store) return [];
  const [product, collection] = await Promise.all([
    prisma.product.findFirst({ where: { storeId: store.id, status: "active" }, orderBy: { createdAt: "asc" }, select: { slug: true } }),
    prisma.collection.findFirst({ where: { storeId: store.id }, orderBy: { createdAt: "asc" }, select: { slug: true } }),
  ]);
  return [
    { key: "home", label: "Home", path: "/" },
    collection && { key: "collection", label: "Collection", path: `/collections/${collection.slug}` },
    { key: "all", label: "All products", path: "/collections/all" },
    product && { key: "product", label: "Product", path: `/products/${product.slug}` },
    { key: "search", label: "Search", path: "/search?q=a" },
    { key: "cart", label: "Cart", path: "/cart" },
    { key: "contact", label: "Contact", path: "/contact" },
    { key: "account", label: "Sign in", path: "/account/login" },
  ].filter(Boolean);
}

function previewBase(store, themeId) {
  return themeId && store ? { base: storefrontUrl(store, "/").replace(/\/$/, ""), themeId } : null;
}

/** A version installed (unpublished, hidden) on the demo store so anyone
 * can preview it. Replaces the listing's previous preview. */
async function installPreview(prisma, listing, version) {
  const store = await demoStore(prisma);
  if (!store) return null;
  const old = listing.previewThemeId;
  const theme = await prisma.$transaction(
    async (tx) => {
      const t = await tx.theme.create({
        data: {
          storeId: store.id,
          name: `${listing.name} ${version.version} (preview)`,
          handle: `mkt-${listing.slug}`,
          version: version.version,
          description: listing.tagline || null,
          status: "draft",
          isActive: false,
          listingId: listing.id,
          settingsData: settingsDataOf(version.files),
        },
      });
      await tx.themeFile.createMany({ data: version.files.map((f) => ({ themeId: t.id, path: f.path, fileType: f.fileType, content: f.content })) });
      return t;
    },
    { timeout: 30000 }
  );
  await prisma.marketListing.update({ where: { id: listing.id }, data: { previewThemeId: theme.id } });
  if (old && old !== theme.id) await prisma.theme.deleteMany({ where: { id: old, storeId: store.id, listingId: listing.id, isActive: false } }).catch(() => {});
  return theme.id;
}

/** Oyklane's own themes preview from a copy on the demo store too. */
async function officialPreviewTheme(prisma, handle) {
  const store = await demoStore(prisma);
  if (!store || !themes.MASTER_THEMES[handle]) return null;
  // The demo store's own copy (customised, with its content) if it has
  // one; else a hidden copy just for previews.
  const existing =
    (await prisma.theme.findFirst({ where: { storeId: store.id, handle, listingId: null }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }], select: { id: true } })) ||
    (await prisma.theme.findFirst({ where: { storeId: store.id, handle, listingId: `official:${handle}` }, select: { id: true } }));
  if (existing) return existing.id;
  const t = await themes.installTheme(prisma, store.id, handle);
  await prisma.theme.update({ where: { id: t.id }, data: { listingId: `official:${handle}`, status: "draft", isActive: false } });
  return t.id;
}

// ── What the store shows ──────────────────────────────────────────

function listingOut(l, { full = false } = {}) {
  const price = num(l.price);
  return {
    id: l.id,
    kind: l.kind,
    slug: l.slug,
    name: l.name,
    tagline: l.tagline,
    category: l.category,
    price,
    free: price <= 0,
    official: false,
    by: l.partner ? { name: l.partner.company || l.partner.name, website: l.partner.website || null } : null,
    icon: mediaUrl(l.iconId),
    screenshots: (Array.isArray(l.screenshots) ? l.screenshots : []).map(mediaUrl),
    installs: l.installs,
    updatedAt: l.updatedAt,
    ...(full && {
      description: l.description,
      scopes: l.scopes,
      scopeLabels: (l.scopes || []).map((s) => apiKeys.SCOPES.find((x) => x.key === s)?.label || s),
      supportEmail: l.supportEmail,
      privacyUrl: l.privacyUrl,
      embeds: Boolean(l.embedScriptUrl),
    }),
  };
}

function officialThemes() {
  return Object.entries(themes.MASTER_THEMES).map(([handle, t]) => ({
    id: `oyk-theme-${handle}`,
    kind: "theme",
    slug: handle,
    name: t.name,
    tagline: `Best for ${/^[A-Z][a-z]/.test(t.bestFor) ? t.bestFor[0].toLowerCase() + t.bestFor.slice(1) : t.bestFor}`,
    description: t.description,
    category: { atelier: "fashion", fresh: "food", lumiere: "jewellery" }[handle] || "general",
    price: 0,
    free: true,
    official: true,
    by: { name: "Oyklane", website: null },
    icon: null,
    swatch: t.swatch,
    screenshots: [],
    installs: null,
    version: t.version,
  }));
}

async function officialApps(prisma) {
  const apps = await prisma.app.findMany({ orderBy: { name: "asc" } });
  return apps
    .filter((a) => !a.key.startsWith("mkt-"))
    .map((a) => ({
      id: `oyk-app-${a.key}`,
      kind: "app",
      slug: a.key,
      name: a.name,
      tagline: (a.description || "").split(/(?<=\.)\s/)[0].slice(0, 120),
      description: a.description,
      category: a.category,
      price: num(a.priceMonthly),
      free: !(num(a.priceMonthly) > 0),
      official: true,
      by: { name: "Oyklane", website: null },
      icon: null,
      iconKey: a.iconKey,
      screenshots: [],
      installs: null,
    }));
}

const browseSchema = z.object({
  kind: z.enum(["theme", "app"]).optional(),
  price: z.enum(["all", "free", "paid"]).default("all"),
  category: z.string().max(40).optional(),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(["popular", "newest", "price"]).default("popular"),
});

async function browse(prisma, query) {
  const q = browseSchema.parse(query || {});
  const rows = await prisma.marketListing.findMany({
    where: { status: "approved", ...(q.kind && { kind: q.kind }) },
    include: { partner: { select: { name: true, company: true, website: true } } },
    orderBy: q.sort === "newest" ? { publishedAt: "desc" } : q.sort === "price" ? { price: "asc" } : { installs: "desc" },
    take: 200,
  });
  let items = [...(q.kind !== "app" ? officialThemes() : []), ...(q.kind !== "theme" ? await officialApps(prisma) : []), ...rows.map((l) => listingOut(l))];
  if (q.price === "free") items = items.filter((i) => i.free);
  if (q.price === "paid") items = items.filter((i) => !i.free);
  if (q.category) items = items.filter((i) => i.category === q.category);
  if (q.q) {
    const term = q.q.toLowerCase();
    items = items.filter((i) => `${i.name} ${i.tagline || ""} ${i.description || ""} ${i.by?.name || ""}`.toLowerCase().includes(term));
  }
  if (q.sort === "price") items.sort((a, b) => a.price - b.price);
  return { items, categories: { theme: THEME_CATEGORIES, app: APP_CATEGORIES }, partnerShare: env.MARKET_PARTNER_SHARE };
}

/** One listing's page: details, and for a theme its preview links. */
async function detail(prisma, kind, slug) {
  if (!KINDS.includes(kind)) throw new HttpError(404, "Not found");
  const store = await demoStore(prisma);
  if (kind === "theme" && themes.MASTER_THEMES[slug]) {
    const item = officialThemes().find((t) => t.slug === slug);
    const themeId = await officialPreviewTheme(prisma, slug).catch(() => null);
    return { item, preview: previewBase(store, themeId), pages: await previewPages(prisma) };
  }
  if (kind === "app") {
    const app = (await officialApps(prisma)).find((a) => a.slug === slug);
    if (app) return { item: app, preview: null, pages: [] };
  }
  const l = await prisma.marketListing.findFirst({ where: { slug, kind, status: "approved" }, include: { partner: { select: { name: true, company: true, website: true } } } });
  if (!l) throw new HttpError(404, "Not found");
  const version = l.liveVersionId ? await prisma.marketVersion.findUnique({ where: { id: l.liveVersionId }, select: { version: true, changelog: true, createdAt: true } }) : null;
  return {
    item: { ...listingOut(l, { full: true }), version: version?.version || null, changelog: version?.changelog || null },
    preview: kind === "theme" ? previewBase(store, l.previewThemeId) : null,
    pages: kind === "theme" ? await previewPages(prisma) : [],
  };
}

async function media(prisma, id) {
  const row = await prisma.marketMedia.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, "Not found");
  return row;
}

// ── Developers ────────────────────────────────────────────────────

const listingSchema = z.object({
  kind: z.enum(["theme", "app"]),
  name: z.string().trim().min(2, "Give it a name").max(60),
  tagline: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(8000).optional().nullable(),
  category: z.string().trim().max(40).optional(),
  price: z.coerce.number().min(0).max(100000).optional().nullable(),
  iconId: z.string().max(40).optional().nullable(),
  screenshots: z.array(z.string().max(40)).max(10).optional(),
  appUrl: z.string().trim().url().startsWith("https://", "Use an https:// link").max(500).optional().nullable().or(z.literal("").transform(() => null)),
  installWebhook: z.string().trim().url().startsWith("https://", "Use an https:// link").max(500).optional().nullable().or(z.literal("").transform(() => null)),
  embedScriptUrl: z.string().trim().url().startsWith("https://", "Use an https:// link").max(500).optional().nullable().or(z.literal("").transform(() => null)),
  scopes: z.array(z.enum(apiKeys.SCOPES.map((s) => s.key))).max(10).optional(),
  supportEmail: z.string().trim().email().max(120).optional().nullable().or(z.literal("").transform(() => null)),
  privacyUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal("").transform(() => null)),
});
// A paid theme or app costs at least ₹99 — below that Razorpay's fee and
// GST eat most of it.
const MIN_PRICE = 99;

function partnerListing(l) {
  return {
    ...listingOut(l, { full: true }),
    status: l.status,
    reviewNote: l.reviewNote,
    iconId: l.iconId,
    screenshotIds: Array.isArray(l.screenshots) ? l.screenshots : [],
    appUrl: l.appUrl,
    installWebhook: l.installWebhook,
    embedScriptUrl: l.embedScriptUrl,
    hasSecret: Boolean(l.appSecret),
    liveVersionId: l.liveVersionId,
    previewThemeId: l.previewThemeId,
    publishedAt: l.publishedAt,
    createdAt: l.createdAt,
  };
}

async function ownListing(prisma, partner, id) {
  const l = await prisma.marketListing.findFirst({ where: { id, partnerId: partner.id }, include: { partner: true } });
  if (!l) throw new HttpError(404, "Listing not found");
  return l;
}

async function uniqueSlug(prisma, name) {
  const base = slugify(name) || "listing";
  const reserved = new Set([...Object.keys(themes.MASTER_THEMES), ...(await prisma.app.findMany({ select: { key: true } })).map((a) => a.key)]);
  for (let i = 1; i < 50; i += 1) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (reserved.has(slug)) continue;
    if (!(await prisma.marketListing.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

function checkPrice(price) {
  if (price && price > 0 && price < MIN_PRICE) throw new HttpError(400, `A paid listing costs at least ₹${MIN_PRICE}. Set 0 to make it free.`);
}

async function partnerOverview(prisma, partner) {
  const [listings, earnings] = await Promise.all([
    prisma.marketListing.findMany({ where: { partnerId: partner.id }, include: { partner: true }, orderBy: { createdAt: "desc" } }),
    prisma.partnerEarning.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const owed = earnings.filter((e) => !e.payoutId).reduce((n, e) => n + num(e.share), 0);
  const total = await prisma.partnerEarning.aggregate({ where: { partnerId: partner.id }, _sum: { share: true, gross: true }, _count: { _all: true } });
  const payouts = await prisma.partnerPayout.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: "desc" }, take: 20 });
  return {
    listings: listings.map(partnerListing),
    categories: { theme: THEME_CATEGORIES, app: APP_CATEGORIES },
    scopes: apiKeys.SCOPES,
    earnings: {
      share: env.MARKET_PARTNER_SHARE,
      lifetime: num(total._sum.share),
      sales: total._count._all,
      owed: round2(owed),
      recent: earnings.map((e) => ({ id: e.id, listingId: e.listingId, source: e.source, gross: num(e.gross), share: num(e.share), paid: Boolean(e.payoutId), createdAt: e.createdAt })),
      payouts: payouts.map((p) => ({ id: p.id, amount: num(p.amount), status: p.status, reference: p.reference, paidAt: p.paidAt, createdAt: p.createdAt })),
    },
  };
}

async function createListing(prisma, partner, input) {
  const data = listingSchema.parse(input || {});
  checkPrice(data.price);
  const listing = await prisma.marketListing.create({
    data: {
      ...data,
      partnerId: partner.id,
      slug: await uniqueSlug(prisma, data.name),
      category: data.category || (data.kind === "theme" ? "general" : "other"),
      screenshots: data.screenshots || [],
      scopes: data.scopes || [],
      price: data.price || null,
      appSecret: data.kind === "app" ? encryptSecret(`oyks_${crypto.randomBytes(24).toString("base64url")}`) : null,
    },
    include: { partner: true },
  });
  return partnerListing(listing);
}

async function updateListing(prisma, partner, id, input) {
  const current = await ownListing(prisma, partner, id);
  const { kind: _kind, ...data } = listingSchema.partial().parse(input || {});
  checkPrice(data.price);
  if (data.price !== undefined) data.price = data.price || null;
  // A listed item's changes go live with its next approved version (the
  // texts and price at once — the store shows what was reviewed).
  const listing = await prisma.marketListing.update({ where: { id: current.id }, data, include: { partner: true } });
  return partnerListing(listing);
}

/** The app's signing secret, shown to its developer only. */
async function appSecret(prisma, partner, id, { rotate = false } = {}) {
  const l = await ownListing(prisma, partner, id);
  if (l.kind !== "app") throw new HttpError(400, "Only apps have a secret.");
  let secret = l.appSecret ? decryptSecret(l.appSecret) : null;
  if (rotate || !secret) {
    secret = `oyks_${crypto.randomBytes(24).toString("base64url")}`;
    await prisma.marketListing.update({ where: { id: l.id }, data: { appSecret: encryptSecret(secret) } });
  }
  return { secret };
}

async function listVersions(prisma, partner, id) {
  const l = await ownListing(prisma, partner, id);
  const versions = await prisma.marketVersion.findMany({ where: { listingId: l.id }, orderBy: { createdAt: "desc" }, select: { id: true, version: true, changelog: true, size: true, status: true, reviewNote: true, createdAt: true } });
  const store = l.kind === "theme" ? await demoStore(prisma) : null;
  return { versions, liveVersionId: l.liveVersionId, preview: previewBase(store, l.previewThemeId), pages: l.kind === "theme" ? await previewPages(prisma) : [] };
}

const versionSchema = z.object({
  version: z
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+$/, "Use a version like 1.0.0"),
  changelog: z.string().trim().max(2000).optional().nullable(),
});

/** A theme upload (zip), or an app release (no files). */
async function addVersion(prisma, partner, id, { fields, zip }) {
  const l = await ownListing(prisma, partner, id);
  const meta = versionSchema.parse(fields || {});
  if (await prisma.marketVersion.findFirst({ where: { listingId: l.id, version: meta.version }, select: { id: true } })) throw new HttpError(409, `Version ${meta.version} already exists — use a higher number.`);
  let files = [];
  let size = 0;
  if (l.kind === "theme") {
    if (!zip) throw new HttpError(400, "Upload the theme as a .zip file.");
    ({ files, size } = parseThemeZip(zip));
  }
  const v = await prisma.marketVersion.create({ data: { listingId: l.id, version: meta.version, changelog: meta.changelog || null, files, size } });
  // The developer previews it on the demo store straight away.
  if (l.kind === "theme") await installPreview(prisma, l, v).catch(() => null);
  return { id: v.id, version: v.version, status: v.status, size, files: files.length };
}

/** Sends the listing (and its newest version) to Oyklane's review. */
async function submit(prisma, partner, id) {
  const l = await ownListing(prisma, partner, id);
  const latest = await prisma.marketVersion.findFirst({ where: { listingId: l.id }, orderBy: { createdAt: "desc" } });
  const missing = [];
  if (!latest) missing.push(l.kind === "theme" ? "upload the theme (.zip)" : "add a release");
  if (!l.description || l.description.length < 80) missing.push("a description (80+ characters)");
  if (!(Array.isArray(l.screenshots) && l.screenshots.length)) missing.push("at least one screenshot");
  if (l.kind === "app" && !l.appUrl) missing.push("the app's link");
  if (l.kind === "app" && !l.installWebhook) missing.push("the install webhook");
  if (num(l.price) > 0 && !partner.payoutUpi) missing.push("your payout UPI ID (Account)");
  if (missing.length) throw new HttpError(400, `Before review, add: ${missing.join(", ")}.`);
  await prisma.$transaction([
    prisma.marketVersion.update({ where: { id: latest.id }, data: { status: "in_review" } }),
    prisma.marketListing.update({ where: { id: l.id }, data: { status: l.status === "approved" ? "approved" : "in_review", reviewNote: null } }),
  ]);
  return { ok: true };
}

async function uploadMedia(prisma, partner, buffer) {
  if (buffer.length > 3 * 1024 * 1024) throw new HttpError(400, "Images can be up to 3 MB.");
  const type = detectImageType(buffer);
  if (!type) throw new HttpError(400, "Upload a JPEG, PNG, WebP or GIF image.");
  const row = await prisma.marketMedia.create({ data: { partnerId: partner.id, mimeType: type.mime, size: buffer.length, data: buffer }, select: { id: true } });
  return { id: row.id, url: mediaUrl(row.id) };
}

// ── Review (super admin) ──────────────────────────────────────────

async function reviewQueue(prisma) {
  const versions = await prisma.marketVersion.findMany({
    where: { status: "in_review" },
    orderBy: { createdAt: "asc" },
    select: { id: true, version: true, changelog: true, size: true, createdAt: true, listing: { include: { partner: true } } },
  });
  const store = await demoStore(prisma);
  const listings = await prisma.marketListing.findMany({ include: { partner: true }, orderBy: { updatedAt: "desc" }, take: 100 });
  const partners = await prisma.partner.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { _count: { select: { listings: true } } } });
  const owed = await prisma.partnerEarning.groupBy({ by: ["partnerId"], where: { payoutId: null }, _sum: { share: true } });
  const owedBy = Object.fromEntries(owed.map((o) => [o.partnerId, num(o._sum.share)]));
  return {
    queue: versions.map((v) => ({
      id: v.id,
      version: v.version,
      changelog: v.changelog,
      size: v.size,
      createdAt: v.createdAt,
      listing: { ...partnerListing(v.listing), partner: { name: v.listing.partner.name, email: v.listing.partner.email } },
      preview: v.listing.kind === "theme" ? previewBase(store, v.listing.previewThemeId) : null,
    })),
    listings: listings.map((l) => ({ ...partnerListing(l), partner: { name: l.partner.name, email: l.partner.email } })),
    partners: partners.map((p) => ({ id: p.id, name: p.name, email: p.email, company: p.company, status: p.status, payoutUpi: p.payoutUpi, payoutName: p.payoutName, listings: p._count.listings, owed: round2(owedBy[p.id] || 0), createdAt: p.createdAt })),
    pages: await previewPages(prisma),
  };
}

async function decide(prisma, versionId, { approve, note }) {
  const v = await prisma.marketVersion.findUnique({ where: { id: versionId }, include: { listing: true } });
  if (!v || v.status !== "in_review") throw new HttpError(404, "Nothing to review here.");
  if (!approve && !String(note || "").trim()) throw new HttpError(400, "Say what needs fixing — the developer sees it.");
  if (approve) {
    await prisma.$transaction([
      prisma.marketVersion.update({ where: { id: v.id }, data: { status: "approved", reviewNote: note || null } }),
      prisma.marketListing.update({ where: { id: v.listingId }, data: { status: "approved", liveVersionId: v.id, reviewNote: note || null, publishedAt: v.listing.publishedAt || new Date() } }),
    ]);
    if (v.listing.kind === "theme") await installPreview(prisma, v.listing, v).catch(() => null);
    // An app goes in every store's Apps page (and is billed monthly if paid).
    if (v.listing.kind === "app") await require("./store").syncAppRow(prisma, { ...v.listing, status: "approved" });
  } else {
    await prisma.$transaction([
      prisma.marketVersion.update({ where: { id: v.id }, data: { status: "rejected", reviewNote: note } }),
      prisma.marketListing.update({ where: { id: v.listingId }, data: { status: v.listing.liveVersionId ? "approved" : "rejected", reviewNote: note } }),
    ]);
  }
  return { ok: true };
}

async function setListingStatus(prisma, id, status) {
  if (!["approved", "suspended"].includes(status)) throw new HttpError(400, "Unknown status");
  const l = await prisma.marketListing.findUnique({ where: { id } });
  if (!l) throw new HttpError(404, "Listing not found");
  if (status === "approved" && !l.liveVersionId) throw new HttpError(400, "It has no approved version yet.");
  await prisma.marketListing.update({ where: { id }, data: { status } });
  return { ok: true };
}

/** Pays out everything a developer is owed (recorded once the money is sent). */
async function recordPayout(prisma, partnerId, { reference }) {
  const due = await prisma.partnerEarning.findMany({ where: { partnerId, payoutId: null }, select: { id: true, share: true } });
  const amount = round2(due.reduce((n, e) => n + num(e.share), 0));
  if (!(amount > 0)) throw new HttpError(400, "Nothing is owed to this developer.");
  return prisma.$transaction(async (tx) => {
    const payout = await tx.partnerPayout.create({ data: { partnerId, amount, status: "paid", reference: String(reference || "").slice(0, 120) || null, paidAt: new Date() } });
    await tx.partnerEarning.updateMany({ where: { id: { in: due.map((e) => e.id) } }, data: { payoutId: payout.id } });
    return { id: payout.id, amount };
  });
}

module.exports = {
  THEME_CATEGORIES,
  APP_CATEGORIES,
  demoStore,
  browse,
  detail,
  media,
  mediaUrl,
  partnerOverview,
  createListing,
  updateListing,
  appSecret,
  listVersions,
  addVersion,
  submit,
  uploadMedia,
  reviewQueue,
  decide,
  setListingStatus,
  recordPayout,
  slugify,
};
