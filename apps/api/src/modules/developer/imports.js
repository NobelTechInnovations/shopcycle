const dns = require("dns").promises;
const net = require("net");
const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { toE164 } = require("../../lib/phone");
const { placeholderEmail, isPlaceholderEmail } = require("../../lib/placeholder-email");
const { saveUpload } = require("../uploads/service");

/**
 * Helpers for the public API's create calls, written for imports (e.g.
 * copying a Shopify store): snake_case field names like the API's
 * responses, a category by name, images copied into the store's own Files,
 * and an `external_id` so a re-run finds what it already made.
 */

// ── Products ──────────────────────────────────────────────────────

const pick = (o, ...keys) => {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
};

/** The API's snake_case body → the product schema's fields. camelCase
 * still works (it's what the API took before). */
function productBody(raw = {}) {
  const b = { ...raw };
  const map = {
    productType: ["product_type"],
    seoTitle: ["seo_title"],
    seoDescription: ["seo_description"],
    hsnCode: ["hsn_code"],
    collectionIds: ["collection_ids"],
    externalId: ["external_id"],
    categoryId: ["category_id"],
    brandId: ["brand_id"],
  };
  for (const [to, from] of Object.entries(map)) {
    const v = pick(raw, ...from);
    if (v !== undefined && b[to] === undefined) b[to] = v;
    for (const f of from) delete b[f];
  }
  if (b.seo && typeof b.seo === "object") {
    if (b.seoTitle === undefined) b.seoTitle = b.seo.title;
    if (b.seoDescription === undefined) b.seoDescription = b.seo.description;
    delete b.seo;
  }
  if (Array.isArray(b.tags)) b.tags = b.tags.map((t) => String(t).trim()).filter(Boolean).join(", ");
  if (Array.isArray(b.images)) {
    b.images = b.images.map((img, i) => (typeof img === "string" ? { url: img, position: i } : { url: img.url || img.src, altText: img.altText ?? img.alt ?? null, position: img.position ?? i }));
  }
  if (Array.isArray(b.variants)) {
    b.variants = b.variants.map((v) => {
      const out = { ...v };
      if (out.comparePrice === undefined && v.compare_at_price !== undefined) out.comparePrice = v.compare_at_price;
      if (out.inventoryQuantity === undefined && v.inventory_quantity !== undefined) out.inventoryQuantity = v.inventory_quantity;
      // Option values ("M", "Red") → the variant's name, "M / Red".
      if (!out.title && Array.isArray(v.options) && v.options.length) out.title = v.options.map((o) => String(typeof o === "object" ? o.value : o).trim()).filter(Boolean).join(" / ");
      delete out.compare_at_price;
      delete out.inventory_quantity;
      delete out.options;
      return out;
    });
  }
  return b;
}

/** `category: "Spices"` → its id, made if the store doesn't have it. */
async function categoryIdFor(prisma, storeId, name) {
  const title = String(name || "").trim().slice(0, 120);
  if (!title) return null;
  const found = await prisma.category.findFirst({ where: { storeId, title: { equals: title, mode: "insensitive" } }, select: { id: true } });
  if (found) return found.id;
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "category";
  let slug = base;
  for (let n = 2; await prisma.category.findFirst({ where: { storeId, slug }, select: { id: true } }); n++) slug = `${base}-${n}`;
  return (await prisma.category.create({ data: { storeId, title, slug }, select: { id: true } })).id;
}

// ── Copying images ────────────────────────────────────────────────

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
function isPrivate(ip) {
  if (net.isIPv4(ip)) return PRIVATE_V4.some((r) => r.test(ip));
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
}

/** Downloads one public https image (no private addresses, ≤ 8MB, 15s). */
async function fetchImage(url, hops = 0) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error("not a valid URL");
  }
  if (u.protocol !== "https:") throw new Error("only https image URLs can be copied");
  const addrs = await dns.lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivate(a.address))) throw new Error("that address isn't public");
  const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(15000), headers: { "user-agent": "Oyklane-Import/1.0" } });
  if (res.status >= 300 && res.status < 400 && res.headers.get("location") && hops < 3) return fetchImage(new URL(res.headers.get("location"), u).toString(), hops + 1);
  if (!res.ok) throw new Error(`the image answered ${res.status}`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > 8 * 1024 * 1024) throw new Error("image is over 8MB");
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > 8 * 1024 * 1024) throw new Error("image is over 8MB");
  return { buffer, filename: decodeURIComponent(u.pathname.split("/").pop() || "image").slice(0, 120) };
}

/** Copies each image into the store's Files (4 at a time) so the product
 * doesn't depend on the old store. One that can't be copied keeps its
 * original URL, and is listed in `warnings`. */
async function copyImages(prisma, storeId, images) {
  const out = images.map((img) => ({ ...img }));
  const warnings = [];
  let next = 0;
  async function worker() {
    while (next < out.length) {
      const i = next++;
      try {
        const got = await fetchImage(out[i].url);
        const file = await saveUpload(prisma, storeId, got);
        out[i].url = file.url;
      } catch (err) {
        warnings.push(`Image ${i + 1} wasn't copied (${err.message}); it links to the original URL.`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, out.length) }, worker));
  return { images: out, warnings };
}

// ── Customers ─────────────────────────────────────────────────────

const str = (max) => z.string().trim().max(max).optional().nullable();
const customerSchema = z
  .object({
    name: str(120),
    first_name: str(60),
    last_name: str(60),
    email: z.string().trim().toLowerCase().email("Enter a valid email").max(200).optional().nullable().or(z.literal("").transform(() => null)),
    phone: str(30),
    address1: str(200),
    address2: str(200),
    city: str(100),
    province: str(100),
    zip: str(20),
    country: str(60),
    tags: z.union([z.array(z.string().trim().max(60)).max(50), z.string().trim().max(1000)]).optional().nullable(),
    accepts_email_marketing: z.boolean().optional(),
    accepts_sms_marketing: z.boolean().optional(),
    external_id: z.string().trim().min(1).max(120).optional().nullable(),
  })
  .strict();

const tagList = (t) => (Array.isArray(t) ? t : String(t || "").split(",")).map((x) => String(x).trim()).filter(Boolean);

/** Customer fields from the API body (only those it sent). */
function customerData(b, phone) {
  const name = b.name || [b.first_name, b.last_name].filter(Boolean).join(" ").trim();
  const d = {};
  if (name) d.name = name.slice(0, 120);
  if (phone) d.phone = `+${phone}`;
  for (const k of ["address1", "address2", "city", "province", "zip", "country"]) if (b[k]) d[k] = b[k];
  if (b.accepts_email_marketing !== undefined) d.acceptsEmailMarketing = b.accepts_email_marketing;
  if (b.accepts_sms_marketing !== undefined) d.acceptsSmsMarketing = b.accepts_sms_marketing;
  return d;
}

/** A customer with this phone (any formatting), or null. */
async function byPhone(prisma, storeId, e164) {
  const rows = await prisma.customer.findMany({ where: { storeId, phone: { endsWith: e164.slice(-10) } }, take: 20 });
  return rows.find((c) => toE164(c.phone) === e164) || null;
}

/**
 * Creates a customer — or, when one already matches (external_id, then
 * email, then phone), fills in what it was missing and returns it, so the
 * same import can run twice. Returns { customer, created }.
 */
async function upsertCustomer(prisma, storeId, raw) {
  const b = customerSchema.parse(raw || {});
  const phone = b.phone ? toE164(b.phone) : null;
  if (b.phone && !phone) throw new HttpError(400, "Enter the phone with its country code, e.g. +91 98765 43210");
  if (!b.email && !phone) throw new HttpError(400, "A customer needs an email or a phone number");

  const existing =
    (b.external_id && (await prisma.customer.findUnique({ where: { storeId_externalId: { storeId, externalId: b.external_id } } }))) ||
    (b.email && (await prisma.customer.findFirst({ where: { storeId, email: { equals: b.email, mode: "insensitive" } } }))) ||
    (phone && (await byPhone(prisma, storeId, phone))) ||
    null;

  const data = customerData(b, phone);
  const tags = tagList(b.tags);
  if (existing) {
    // Fill gaps only — never overwrite what the store already has.
    const patch = {};
    for (const [k, v] of Object.entries(data)) if (existing[k] == null || existing[k] === "" || (k === "name" && existing.name === existing.phone)) patch[k] = v;
    if (b.email && isPlaceholderEmail(existing.email)) patch.email = b.email;
    if (b.external_id && !existing.externalId) patch.externalId = b.external_id;
    if (tags.length) patch.tags = [...new Set([...tagList(existing.tags), ...tags])].join(", ");
    const customer = Object.keys(patch).length ? await prisma.customer.update({ where: { id: existing.id }, data: patch }) : existing;
    return { customer, created: false };
  }
  const customer = await prisma.customer.create({
    data: {
      storeId,
      name: data.name || b.email?.split("@")[0] || `+${phone}`,
      email: b.email || placeholderEmail(phone),
      ...data,
      ...(tags.length && { tags: tags.join(", ") }),
      ...(b.external_id && { externalId: b.external_id }),
    },
  });
  return { customer, created: true };
}

/** PATCH /customers/:id — sets what it sends. */
async function updateCustomer(prisma, storeId, id, raw) {
  const b = customerSchema.parse(raw || {});
  const current = await prisma.customer.findFirst({ where: { id, storeId } });
  if (!current) throw new HttpError(404, "Customer not found");
  const phone = b.phone ? toE164(b.phone) : null;
  if (b.phone && !phone) throw new HttpError(400, "Enter the phone with its country code, e.g. +91 98765 43210");
  const data = customerData(b, phone);
  if (b.email && b.email !== current.email) {
    const clash = await prisma.customer.findFirst({ where: { storeId, email: { equals: b.email, mode: "insensitive" }, id: { not: id } }, select: { id: true } });
    if (clash) throw new HttpError(409, "Another customer has that email");
    data.email = b.email;
  }
  if (b.tags !== undefined) data.tags = tagList(b.tags).join(", ") || null;
  if (b.external_id !== undefined) data.externalId = b.external_id || null;
  return prisma.customer.update({ where: { id }, data });
}

module.exports = { productBody, categoryIdFor, copyImages, upsertCustomer, updateCustomer, byPhone };
