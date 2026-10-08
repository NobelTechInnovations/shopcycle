const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { decryptSecret } = require("../../lib/crypto");
const { storefrontUrl } = require("../../lib/storefront-url");
const { provider, billingMode } = require("../billing/providers");
const billingSettings = require("../billing/settings");
const apiKeys = require("../developer/api-keys");
const themes = require("../themes/service");
const { settingsDataOf } = require("./theme-package");
const market = require("./service");

/**
 * The seller's side of the Oyklane Store, in their admin: see a listing,
 * buy it, install it.
 *
 * Paying: Oyklane's own Razorpay account takes the money (price + GST).
 * A purchase only counts once Razorpay confirms it — the checkout
 * signature, then the payment itself fetched from Razorpay (captured, this
 * order, this amount) — or Razorpay's signed webhook says so. Nothing the
 * browser says is taken on trust. The developer's share is recorded then.
 *
 * Themes are one-time purchases; the licence is for this store only, and
 * the copy installed is locked (themes/service.js protectedFile).
 * Apps are monthly (an App row "mkt-<slug>", billed with the plan like
 * any paid app); installing one gives the developer an API key for this
 * store with the permissions it asked for.
 */

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const num = (v) => (v == null ? 0 : Number(v));

async function approvedListing(prisma, kind, slug) {
  const l = await prisma.marketListing.findFirst({ where: { slug, kind, status: "approved" }, include: { partner: true } });
  if (!l || !l.liveVersionId) throw new HttpError(404, "This isn't on the Oyklane Store (any more).");
  return l;
}

async function gstRate(prisma) {
  const s = await billingSettings.getSettings(prisma).catch(() => null);
  return Number(s?.taxRate ?? 18);
}

/** The listing as the seller's install page shows it. */
async function forStore(prisma, store, kind, slug) {
  const { item, preview, pages } = await market.detail(prisma, kind, slug);
  if (item.official) {
    const installed =
      kind === "theme"
        ? Boolean(await prisma.theme.findFirst({ where: { storeId: store.id, handle: slug }, select: { id: true } }))
        : Boolean(await prisma.storeApp.findFirst({ where: { storeId: store.id, app: { key: slug } }, select: { id: true } }));
    return { item, preview, pages, owned: true, installed, official: true };
  }
  const l = await approvedListing(prisma, kind, slug);
  const lic = await prisma.marketLicense.findUnique({ where: { listingId_storeId: { listingId: l.id, storeId: store.id } } });
  const rate = await gstRate(prisma);
  const price = num(l.price);
  const installedTheme = kind === "theme" ? await prisma.theme.findFirst({ where: { storeId: store.id, listingId: l.id }, orderBy: { createdAt: "desc" }, select: { id: true, version: true, isActive: true } }) : null;
  const installedApp = kind === "app" ? await prisma.storeApp.findFirst({ where: { storeId: store.id, app: { key: `mkt-${l.slug}` } }, select: { id: true } }) : null;
  return {
    item,
    preview,
    pages,
    official: false,
    price: { amount: price, gst: round2((price * rate) / 100), total: round2(price + (price * rate) / 100), rate, monthly: kind === "app" },
    owned: price <= 0 || Boolean(lic?.purchaseId) || kind === "app",
    installed: Boolean(installedTheme || installedApp),
    theme: installedTheme,
    payments: billingMode(),
  };
}

function assertManager(role) {
  if (role === "staff") throw new HttpError(403, "Only the store owner or an admin can buy or install from the Oyklane Store.");
}

// ── Buying a theme ────────────────────────────────────────────────

async function buy(prisma, store, slug, { role, user } = {}) {
  assertManager(role);
  const l = await approvedListing(prisma, "theme", slug);
  const price = num(l.price);
  if (price <= 0) return { owned: true };
  if (await prisma.marketLicense.findFirst({ where: { listingId: l.id, storeId: store.id, purchaseId: { not: null } } })) return { owned: true };
  const mode = billingMode();
  if (mode === "unconfigured") throw new HttpError(503, "Payments aren't set up yet. Please try again later.");
  const rate = await gstRate(prisma);
  const gst = round2((price * rate) / 100);
  const total = round2(price + gst);
  const p = provider();
  const receipt = `mkt_${crypto.randomBytes(6).toString("hex")}`;
  const order = await p.createPaymentOrder({ amount: total, receipt, notes: { kind: "market", listing: l.slug, store: store.handle } });
  const purchase = await prisma.marketPurchase.create({
    data: { listingId: l.id, storeId: store.id, amount: price, gst, total, providerOrderId: order.orderId, buyerUserId: user?.id || null },
  });
  if (mode === "sandbox") {
    // Local only (BILLING_SANDBOX): no real payment window.
    await markPaid(prisma, purchase, `pay_sbx_mkt_${crypto.randomBytes(5).toString("hex")}`);
    return { owned: true, sandbox: true };
  }
  return {
    purchaseId: purchase.id,
    checkout: p.checkoutOptions({
      orderId: order.orderId,
      amount: total,
      name: "Oyklane Store",
      description: `${l.name} theme — for ${store.name}`,
      prefill: { email: user?.email || undefined, name: user?.name || undefined },
      notes: { kind: "market", listing: l.slug, store: store.handle },
    }),
  };
}

/** Paid, once: licence for the store, the developer's share. */
async function markPaid(prisma, purchase, paymentId) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.marketPurchase.updateMany({ where: { id: purchase.id, status: { not: "paid" } }, data: { status: "paid", paymentId, paidAt: new Date() } });
    if (!count) return false;
    const listing = await tx.marketListing.findUnique({ where: { id: purchase.listingId } });
    await tx.marketLicense.upsert({
      where: { listingId_storeId: { listingId: purchase.listingId, storeId: purchase.storeId } },
      update: { purchaseId: purchase.id },
      create: { listingId: purchase.listingId, storeId: purchase.storeId, purchaseId: purchase.id },
    });
    await tx.partnerEarning.create({
      data: { partnerId: listing.partnerId, listingId: listing.id, storeId: purchase.storeId, source: "theme_sale", sourceId: purchase.id, gross: purchase.amount, share: round2(num(purchase.amount) * env.MARKET_PARTNER_SHARE) },
    });
    return true;
  });
}

/** Razorpay Checkout finished: check it really was paid, for this order
 * and amount, before granting anything. */
async function verify(prisma, store, { orderId, paymentId, signature }) {
  const purchase = await prisma.marketPurchase.findFirst({ where: { providerOrderId: String(orderId || ""), storeId: store.id } });
  if (!purchase) throw new HttpError(404, "Purchase not found");
  if (purchase.status === "paid") return { owned: true };
  const p = provider();
  if (!p.verifyCheckoutSignature({ orderId, paymentId, signature })) throw new HttpError(400, "We couldn't confirm this payment. If money was taken, it's refunded automatically — or write to support.");
  const payment = await p.fetchPayment(paymentId);
  if (!payment || payment.orderId !== purchase.providerOrderId || Math.abs(num(payment.amount) - num(purchase.total)) > 0.009) {
    throw new HttpError(400, "This payment doesn't match the purchase.");
  }
  if (payment.status !== "captured") return { owned: false, pending: true };
  await markPaid(prisma, purchase, payment.id);
  return { owned: true };
}

/** billing/webhooks.js: a captured payment for one of our orders (the
 * seller closed the window before it came back). */
async function applyWebhookPayment(prisma, pp) {
  const purchase = await prisma.marketPurchase.findUnique({ where: { providerOrderId: pp.orderId } });
  if (!purchase) return null;
  if (pp.status !== "captured") return "applied";
  if (Math.abs(num(pp.amount) - num(purchase.total)) > 0.009) return "ignored";
  await markPaid(prisma, purchase, pp.id);
  return "applied";
}

// ── Installing a theme ────────────────────────────────────────────

/** A copy of the listing's approved version, unpublished. Paid themes
 * are locked; the licence is for this store only. */
async function installTheme(prisma, store, slug, { role } = {}) {
  assertManager(role);
  const l = await approvedListing(prisma, "theme", slug);
  const paid = num(l.price) > 0;
  const lic = await prisma.marketLicense.findUnique({ where: { listingId_storeId: { listingId: l.id, storeId: store.id } } });
  if (paid && !lic?.purchaseId) throw new HttpError(402, "Buy this theme first.");
  const version = await prisma.marketVersion.findUnique({ where: { id: l.liveVersionId } });
  const files = Array.isArray(version?.files) ? version.files : [];
  if (!files.length) throw new HttpError(409, "This theme has no files — the developer needs to upload it again.");
  const first = (await prisma.theme.count({ where: { storeId: store.id } })) === 0;
  const theme = await prisma.$transaction(
    async (tx) => {
      const t = await tx.theme.create({
        data: {
          storeId: store.id,
          name: l.name,
          handle: `mkt-${l.slug}`,
          version: version.version,
          description: l.tagline || null,
          status: "installed",
          isActive: first,
          listingId: l.id,
          locked: paid,
          settingsData: settingsDataOf(files),
        },
      });
      await tx.themeFile.createMany({ data: files.map((f) => ({ themeId: t.id, path: f.path, fileType: f.fileType, content: f.content })) });
      return t;
    },
    { timeout: 30000 }
  );
  await prisma.marketLicense.upsert({
    where: { listingId_storeId: { listingId: l.id, storeId: store.id } },
    update: { installedAt: new Date(), removedAt: null },
    create: { listingId: l.id, storeId: store.id, installedAt: new Date() },
  });
  if (!lic?.installedAt) await prisma.marketListing.update({ where: { id: l.id }, data: { installs: { increment: 1 } } });
  return { themeId: theme.id, name: theme.name };
}

// ── Apps ──────────────────────────────────────────────────────────

/** The App row that puts a developer's app in every store's Apps page and
 * bills it monthly. Kept in step with the listing when it's approved. */
async function syncAppRow(prisma, listing) {
  const data = {
    name: listing.name,
    description: listing.tagline || listing.description?.slice(0, 280) || null,
    category: listing.category || "other",
    iconKey: "puzzle",
    priceMonthly: num(listing.price) > 0 ? listing.price : null,
  };
  return prisma.app.upsert({ where: { key: `mkt-${listing.slug}` }, update: data, create: { key: `mkt-${listing.slug}`, settingsSchema: [], ...data } });
}

const sign = (secret, payload) => crypto.createHmac("sha256", secret).update(payload).digest("hex");

/** Tells the developer's server about an install / removal, signed with
 * the app's secret (header X-Oyklane-Signature: hex HMAC-SHA256 of the
 * body). Best effort, 8 s. */
async function notifyDeveloper(listing, body, log) {
  if (!listing.installWebhook || !listing.appSecret) return false;
  const raw = JSON.stringify(body);
  try {
    const res = await fetch(listing.installWebhook, {
      method: "POST",
      headers: { "content-type": "application/json", "x-oyklane-signature": sign(decryptSecret(listing.appSecret), raw), "x-oyklane-event": body.event },
      body: raw,
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch (err) {
    log?.warn({ err: err.message, app: listing.slug }, "market: developer webhook failed");
    return false;
  }
}

/** apps/service.installApp, for a "mkt-" app: an API key for the
 * developer with the permissions the listing asked for. */
async function onAppInstalled(prisma, store, appKey, { log } = {}) {
  const l = await prisma.marketListing.findFirst({ where: { slug: appKey.replace(/^mkt-/, ""), kind: "app", status: "approved" } });
  if (!l) throw new HttpError(404, "This app isn't on the Oyklane Store any more.");
  const lic = await prisma.marketLicense.findUnique({ where: { listingId_storeId: { listingId: l.id, storeId: store.id } } });
  let token = null;
  if (l.scopes.length) {
    if (lic?.apiKeyId) await prisma.apiKey.updateMany({ where: { id: lic.apiKeyId, storeId: store.id, revokedAt: null }, data: { revokedAt: new Date() } });
    const made = await apiKeys.create(prisma, store.id, { name: `${l.name} (Oyklane Store app)`, scopes: l.scopes }, { actorName: "Oyklane Store" });
    token = { id: made.key.id, value: made.token };
  }
  await prisma.marketLicense.upsert({
    where: { listingId_storeId: { listingId: l.id, storeId: store.id } },
    update: { installedAt: new Date(), removedAt: null, apiKeyId: token?.id || null },
    create: { listingId: l.id, storeId: store.id, installedAt: new Date(), apiKeyId: token?.id || null },
  });
  if (!lic?.installedAt) await prisma.marketListing.update({ where: { id: l.id }, data: { installs: { increment: 1 } } });
  await notifyDeveloper(
    l,
    { event: "app.installed", store: { id: store.id, handle: store.handle, name: store.name, url: storefrontUrl(store, "/") }, apiBase: `${env.API_PUBLIC_URL}/api/v1`, apiKey: token?.value || null, scopes: l.scopes, at: new Date().toISOString() },
    log
  );
}

async function onAppRemoved(prisma, store, appKey, { log } = {}) {
  const l = await prisma.marketListing.findFirst({ where: { slug: appKey.replace(/^mkt-/, ""), kind: "app" } });
  if (!l) return;
  const lic = await prisma.marketLicense.findUnique({ where: { listingId_storeId: { listingId: l.id, storeId: store.id } } });
  if (lic?.apiKeyId) await prisma.apiKey.updateMany({ where: { id: lic.apiKeyId, storeId: store.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (lic) await prisma.marketLicense.update({ where: { id: lic.id }, data: { removedAt: new Date(), apiKeyId: null } });
  await notifyDeveloper(l, { event: "app.uninstalled", store: { id: store.id, handle: store.handle }, at: new Date().toISOString() }, log);
}

/** "Open app": the developer's page, with a signed link saying which
 * store (and when) — the developer checks the signature with their secret. */
async function openAppUrl(prisma, store, appKey) {
  const l = await prisma.marketListing.findFirst({ where: { slug: appKey.replace(/^mkt-/, ""), kind: "app" } });
  if (!l?.appUrl || !l.appSecret) throw new HttpError(404, "This app has no page to open.");
  const params = new URLSearchParams({ store: store.handle, ts: String(Math.floor(Date.now() / 1000)) });
  params.set("signature", sign(decryptSecret(l.appSecret), params.toString()));
  return `${l.appUrl}${l.appUrl.includes("?") ? "&" : "?"}${params}`;
}

/** Storefront: the scripts installed developer apps add to every page. */
async function embedScripts(prisma, storeId) {
  const installs = await prisma.storeApp.findMany({ where: { storeId, app: { key: { startsWith: "mkt-" } } }, select: { app: { select: { key: true } } } });
  if (!installs.length) return [];
  const slugs = installs.map((i) => i.app.key.slice(4));
  const rows = await prisma.marketListing.findMany({ where: { slug: { in: slugs }, kind: "app", status: "approved", embedScriptUrl: { not: null } }, select: { embedScriptUrl: true } });
  return rows.map((r) => r.embedScriptUrl).filter((u) => /^https:\/\/[^\s"'<>]+$/.test(u));
}

/** Developer apps' monthly charges that have been paid → their share.
 * Idempotent (one earning per charge). */
async function syncAppEarnings(prisma) {
  const charges = await prisma.appCharge.findMany({ where: { appKey: { startsWith: "mkt-" }, status: "billed", cycleId: { not: null } }, take: 500, orderBy: { createdAt: "desc" } });
  if (!charges.length) return 0;
  const done = new Set((await prisma.partnerEarning.findMany({ where: { sourceId: { in: charges.map((c) => c.id) } }, select: { sourceId: true } })).map((e) => e.sourceId));
  const fresh = charges.filter((c) => !done.has(c.id));
  if (!fresh.length) return 0;
  const cycles = await prisma.billingCycle.findMany({ where: { id: { in: [...new Set(fresh.map((c) => c.cycleId))] }, status: "paid" }, select: { id: true } });
  const paid = new Set(cycles.map((c) => c.id));
  const listings = await prisma.marketListing.findMany({ where: { slug: { in: [...new Set(fresh.map((c) => c.appKey.slice(4)))] } }, select: { id: true, slug: true, partnerId: true } });
  const bySlug = Object.fromEntries(listings.map((l) => [l.slug, l]));
  let made = 0;
  for (const c of fresh) {
    const l = bySlug[c.appKey.slice(4)];
    if (!l || !paid.has(c.cycleId)) continue;
    await prisma.partnerEarning
      .create({ data: { partnerId: l.partnerId, listingId: l.id, storeId: c.storeId, source: "app_month", sourceId: c.id, gross: c.amount, share: round2(num(c.amount) * env.MARKET_PARTNER_SHARE) } })
      .then(() => (made += 1))
      .catch(() => {});
  }
  return made;
}

/** What this store got from the Oyklane Store. */
async function purchases(prisma, store) {
  const rows = await prisma.marketPurchase.findMany({ where: { storeId: store.id, status: "paid" }, include: { listing: { select: { name: true, slug: true, kind: true } } }, orderBy: { paidAt: "desc" } });
  return rows.map((r) => ({ id: r.id, name: r.listing.name, slug: r.listing.slug, kind: r.listing.kind, amount: num(r.amount), gst: num(r.gst), total: num(r.total), paidAt: r.paidAt }));
}

module.exports = { forStore, buy, verify, applyWebhookPayment, installTheme, syncAppRow, onAppInstalled, onAppRemoved, openAppUrl, embedScripts, syncAppEarnings, purchases, MASTER_THEMES: themes.MASTER_THEMES };
