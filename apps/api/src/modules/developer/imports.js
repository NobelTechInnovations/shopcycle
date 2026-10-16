const crypto = require("crypto");
const dns = require("dns").promises;
const net = require("net");
const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { createDiscountSchema } = require("@shopcycle/validation");
const { toE164 } = require("../../lib/phone");
const { placeholderEmail, isPlaceholderEmail } = require("../../lib/placeholder-email");
const { saveUpload } = require("../uploads/service");
const categoriesService = require("../categories/service");
const collectionsService = require("../collections/service");
const discountsService = require("../discounts/service");
const ordersRepository = require("../orders/repository");
const { trackingUrlFor } = require("../orders/couriers");

/**
 * The public API's import calls — what an app like Booster uses to move a
 * store (e.g. from Shopify) into Oyklane. Each record carries the id it had
 * there (`externalId`, e.g. "shopify:123"), unique per store, so running
 * the same import again finds what it already made instead of duplicating
 * it. Bodies are camelCase like POST /products; snake_case also works.
 * Everything is created through the same services the admin uses.
 */

const toCamel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
/** snake_case keys → camelCase, one level deep (and inside plain objects
 * and arrays of objects). */
function camel(o) {
  if (Array.isArray(o)) return o.map(camel);
  if (!o || typeof o !== "object" || o instanceof Date) return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    const key = toCamel(k);
    if (out[key] === undefined) out[key] = camel(v);
  }
  return out;
}
const extId = z.string().trim().min(1).max(120);
const money = z.coerce.number().min(0).max(100000000);
const optStr = (max) => z.string().trim().max(max).optional().nullable();
const conflict = (err, what) => {
  if (err?.code === "P2002") throw new HttpError(409, `Another ${what} already has that externalId`);
  throw err;
};
const slugify = (v) =>
  String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

// ── Products ──────────────────────────────────────────────────────

/** The body POST/PATCH /products takes, from what an import sends:
 * snake_case names, tags as a list, images as URLs, variants by option
 * values. */
function productBody(raw = {}) {
  const b = camel(raw);
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
    b.variants = b.variants.map(({ compareAtPrice, options, ...v }) => {
      const out = { ...v };
      if (out.comparePrice === undefined && compareAtPrice !== undefined) out.comparePrice = compareAtPrice;
      // Option values ("M", "Red") → the variant's name, "M / Red".
      if (!out.title && Array.isArray(options) && options.length) out.title = options.map((o) => String(typeof o === "object" ? o.value : o).trim()).filter(Boolean).join(" / ");
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
  return (await categoriesService.createCategory(prisma, storeId, { title })).id;
}

// ── Copying images into the store's Files ────────────────────────

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
  if (Number(res.headers.get("content-length") || 0) > 8 * 1024 * 1024) throw new Error("image is over 8MB");
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > 8 * 1024 * 1024) throw new Error("image is over 8MB");
  return { buffer, filename: decodeURIComponent(u.pathname.split("/").pop() || "image").slice(0, 120) };
}

/** Copies each image into the store's Files (4 at a time) so nothing
 * depends on the old store. One that can't be copied keeps its original
 * URL and is listed in `warnings`. Images already on Oyklane are kept. */
async function copyImages(prisma, storeId, images, apiBase) {
  const out = images.map((img) => ({ ...img }));
  const warnings = [];
  let next = 0;
  async function worker() {
    while (next < out.length) {
      const i = next++;
      if (!out[i].url || (apiBase && out[i].url.startsWith(apiBase))) continue;
      try {
        const file = await saveUpload(prisma, storeId, await fetchImage(out[i].url));
        out[i].url = file.url;
      } catch (err) {
        warnings.push(`Image ${i + 1} wasn't copied (${err.message}); it links to the original URL.`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, out.length) }, worker));
  return { images: out, warnings };
}

async function copyOne(prisma, storeId, url, apiBase) {
  if (!url) return { url: null, warnings: [] };
  const { images, warnings } = await copyImages(prisma, storeId, [{ url }], apiBase);
  return { url: images[0].url, warnings };
}

// ── Customers ─────────────────────────────────────────────────────

const addressSchema = z
  .object({ name: optStr(120), address1: optStr(200), address2: optStr(200), city: optStr(100), province: optStr(100), zip: optStr(20), country: optStr(60), phone: optStr(30) })
  .partial();
const customerSchema = z.object({
  name: optStr(120),
  firstName: optStr(60),
  lastName: optStr(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200).optional().nullable().or(z.literal("").transform(() => null)),
  phone: optStr(30),
  address: addressSchema.optional().nullable(),
  address1: optStr(200),
  address2: optStr(200),
  city: optStr(100),
  province: optStr(100),
  zip: optStr(20),
  country: optStr(60),
  tags: z.union([z.array(z.string().trim().max(60)).max(50), z.string().trim().max(1000)]).optional().nullable(),
  acceptsEmailMarketing: z.boolean().optional(),
  acceptsSmsMarketing: z.boolean().optional(),
  externalId: extId.optional().nullable(),
});

const tagList = (t) => (Array.isArray(t) ? t : String(t || "").split(",")).map((x) => String(x).trim()).filter(Boolean);

/** Customer fields from the body (only those it sent). */
function customerData(b, phone) {
  const a = { ...b, ...(b.address || {}) };
  const name = b.name || [b.firstName, b.lastName].filter(Boolean).join(" ").trim() || a.name;
  const d = {};
  if (name) d.name = String(name).slice(0, 120);
  if (phone) d.phone = `+${phone}`;
  for (const k of ["address1", "address2", "city", "province", "zip", "country"]) if (a[k]) d[k] = a[k];
  if (b.acceptsEmailMarketing !== undefined) d.acceptsEmailMarketing = b.acceptsEmailMarketing;
  if (b.acceptsSmsMarketing !== undefined) d.acceptsSmsMarketing = b.acceptsSmsMarketing;
  return d;
}

/** A customer with this phone (any formatting), or null. */
async function byPhone(prisma, storeId, e164) {
  const rows = await prisma.customer.findMany({ where: { storeId, phone: { endsWith: e164.slice(-10) } }, take: 20 });
  return rows.find((c) => toE164(c.phone) === e164) || null;
}

function phoneOf(raw) {
  if (!raw) return null;
  const phone = toE164(raw);
  if (!phone) throw new HttpError(400, "Enter the phone with its country code, e.g. +91 98765 43210");
  return phone;
}

/**
 * POST /customers: creates a customer — or, when one already matches
 * (externalId, then email, then phone), fills in only what it's missing
 * and returns it. Returns { customer, created }.
 */
async function upsertCustomer(prisma, storeId, raw) {
  const b = customerSchema.parse(camel(raw || {}));
  const phone = phoneOf(b.phone || b.address?.phone);
  if (!b.email && !phone) throw new HttpError(400, "A customer needs an email or a phone number");

  const existing =
    (b.externalId && (await prisma.customer.findUnique({ where: { storeId_externalId: { storeId, externalId: b.externalId } } }))) ||
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
    if (b.externalId && !existing.externalId) patch.externalId = b.externalId;
    if (tags.length) patch.tags = [...new Set([...tagList(existing.tags), ...tags])].join(", ");
    const customer = Object.keys(patch).length ? await prisma.customer.update({ where: { id: existing.id }, data: patch }).catch((e) => conflict(e, "customer")) : existing;
    return { customer, created: false };
  }
  const customer = await prisma.customer
    .create({
      data: {
        storeId,
        name: data.name || b.email?.split("@")[0] || `+${phone}`,
        email: b.email || placeholderEmail(phone),
        ...data,
        ...(tags.length && { tags: tags.join(", ") }),
        ...(b.externalId && { externalId: b.externalId }),
      },
    })
    .catch((e) => conflict(e, "customer"));
  return { customer, created: true };
}

/** PATCH /customers/:id — sets what it sends. */
async function updateCustomer(prisma, storeId, id, raw) {
  const b = customerSchema.parse(camel(raw || {}));
  const current = await prisma.customer.findFirst({ where: { id, storeId } });
  if (!current) throw new HttpError(404, "Customer not found");
  const data = customerData(b, phoneOf(b.phone));
  if (b.email && b.email !== current.email) {
    const clash = await prisma.customer.findFirst({ where: { storeId, email: { equals: b.email, mode: "insensitive" }, id: { not: id } }, select: { id: true } });
    if (clash) throw new HttpError(409, "Another customer has that email");
    data.email = b.email;
  }
  if (b.tags !== undefined) data.tags = tagList(b.tags).join(", ") || null;
  if (b.externalId !== undefined) data.externalId = b.externalId || null;
  return prisma.customer.update({ where: { id }, data }).catch((e) => conflict(e, "customer"));
}

// ── Categories ────────────────────────────────────────────────────

const categorySchema = z.object({ name: optStr(120), title: optStr(120), image: z.string().url().optional().nullable(), externalId: extId.optional().nullable() });

/** POST /categories: by externalId, then by name; else made. Categories
 * are flat (no parent). */
async function upsertCategory(prisma, storeId, raw, { apiBase } = {}) {
  const b = categorySchema.parse(camel(raw || {}));
  const title = (b.title || b.name || "").trim();
  if (!title) throw new HttpError(400, "A category needs a name");
  const existing =
    (b.externalId && (await prisma.category.findUnique({ where: { storeId_externalId: { storeId, externalId: b.externalId } } }))) ||
    (await prisma.category.findFirst({ where: { storeId, title: { equals: title, mode: "insensitive" } } }));
  if (existing) {
    const patch = {};
    if (b.externalId && !existing.externalId) patch.externalId = b.externalId;
    if (b.image && !existing.image) patch.image = (await copyOne(prisma, storeId, b.image, apiBase)).url;
    const category = Object.keys(patch).length ? await prisma.category.update({ where: { id: existing.id }, data: patch }).catch((e) => conflict(e, "category")) : existing;
    return { category, created: false, warnings: [] };
  }
  const img = await copyOne(prisma, storeId, b.image, apiBase);
  const category = await categoriesService.createCategory(prisma, storeId, { title, image: img.url, externalId: b.externalId || null }).catch((e) => conflict(e, "category"));
  return { category, created: true, warnings: img.warnings };
}

// ── Collections ───────────────────────────────────────────────────

const collectionSchema = z.object({
  title: z.string().trim().min(1, "A collection needs a title").max(255),
  description: z.string().optional().nullable(),
  image: z.string().url().optional().nullable(),
  status: z.enum(["active", "draft"]).default("active"),
  productIds: z.array(z.string()).max(2000).default([]),
  productExternalIds: z.array(extId).max(2000).default([]),
  externalId: extId.optional().nullable(),
});

async function productIdsFor(prisma, storeId, ids, externalIds) {
  const found = [];
  if (ids.length) found.push(...(await prisma.product.findMany({ where: { storeId, id: { in: ids } }, select: { id: true } })).map((p) => p.id));
  if (externalIds.length) {
    const rows = await prisma.product.findMany({ where: { storeId, externalId: { in: externalIds } }, select: { id: true, externalId: true } });
    const byExt = new Map(rows.map((r) => [r.externalId, r.id]));
    externalIds.forEach((e) => byExt.has(e) && found.push(byExt.get(e)));
  }
  return [...new Set(found)];
}

/** POST /collections: by externalId (its products are topped up with any
 * new ones); else made. Products are linked by id or externalId — import
 * products first. */
async function upsertCollection(prisma, storeId, raw, { apiBase } = {}) {
  const b = collectionSchema.parse(camel(raw || {}));
  const productIds = await productIdsFor(prisma, storeId, b.productIds, b.productExternalIds);
  const missing = b.productIds.length + b.productExternalIds.length - productIds.length;
  const warnings = missing > 0 ? [`${missing} product${missing === 1 ? " wasn't" : "s weren't"} found and ${missing === 1 ? "was" : "were"} left out — import products first.`] : [];
  const existing = b.externalId && (await prisma.collection.findUnique({ where: { storeId_externalId: { storeId, externalId: b.externalId } }, include: { products: { select: { productId: true, position: true } } } }));
  if (existing) {
    const have = new Set(existing.products.map((p) => p.productId));
    let pos = existing.products.reduce((m, p) => Math.max(m, p.position), -1);
    const add = productIds.filter((id) => !have.has(id)).map((productId) => ({ collectionId: existing.id, productId, position: ++pos }));
    if (add.length) await prisma.collectionProduct.createMany({ data: add, skipDuplicates: true });
    return { collection: await collectionsService.getCollection(prisma, storeId, existing.id), created: false, warnings };
  }
  const img = await copyOne(prisma, storeId, b.image, apiBase);
  const collection = await collectionsService
    .createCollection(prisma, storeId, { title: b.title, description: b.description || null, image: img.url, status: b.status, productIds, externalId: b.externalId || null })
    .catch((e) => conflict(e, "collection"));
  return { collection, created: true, warnings: [...warnings, ...img.warnings] };
}

// ── Discounts ─────────────────────────────────────────────────────

const TYPES = { percentage: "percentage", percent: "percentage", fixed_amount: "fixed_amount", fixed: "fixed_amount", free_shipping: "free_shipping", buy_x_get_y: "buy_x_get_y" };

/** POST /discounts: by externalId, then by code; else made with the same
 * rules as the admin's discount form. Imported codes don't show on
 * product pages unless showOnStore is true. */
async function upsertDiscount(prisma, storeId, raw) {
  const b = camel(raw || {});
  const code = String(b.code || "").trim().toUpperCase();
  const existing =
    (b.externalId && (await prisma.discount.findUnique({ where: { storeId_externalId: { storeId, externalId: String(b.externalId) } } }))) ||
    (code && (await prisma.discount.findFirst({ where: { storeId, code: { equals: code, mode: "insensitive" } } })));
  if (existing) {
    if (b.externalId && !existing.externalId) await prisma.discount.update({ where: { id: existing.id }, data: { externalId: String(b.externalId) } }).catch((e) => conflict(e, "discount"));
    return { discount: await discountsService.getDiscount(prisma, storeId, existing.id), created: false };
  }
  const status = b.status ?? (b.active === false ? "disabled" : "active");
  const input = createDiscountSchema.parse({
    method: b.method || (code ? "code" : "automatic"),
    code: code || undefined,
    title: b.title ?? null,
    type: TYPES[String(b.type || "percentage").toLowerCase()] || b.type,
    value: b.value ?? 0,
    appliesTo: b.appliesTo,
    targetIds: b.targetIds,
    minSubtotal: b.minSubtotal ?? null,
    minQuantity: b.minQuantity ?? null,
    maxDiscount: b.maxDiscount ?? null,
    usageLimit: b.usageLimit ?? null,
    oncePerCustomer: Boolean(b.oncePerCustomer ?? b.onePerCustomer),
    buyQuantity: b.buyQuantity ?? null,
    getQuantity: b.getQuantity ?? null,
    startsAt: b.startsAt ?? null,
    endsAt: b.endsAt ?? null,
    status,
    showOnStore: b.showOnStore === true,
  });
  const ext = b.externalId == null ? null : extId.parse(String(b.externalId));
  const created = await discountsService.createDiscount(prisma, storeId, { ...input, externalId: ext }).catch((e) => conflict(e, "discount"));
  if (b.usageCount) await prisma.discount.update({ where: { id: created.id }, data: { usageCount: Math.max(0, Math.floor(Number(b.usageCount) || 0)) } });
  return { discount: await discountsService.getDiscount(prisma, storeId, created.id), created: true };
}

// ── Orders (import) ───────────────────────────────────────────────

const PAYMENT = { pending: "pending", unpaid: "pending", authorized: "pending", paid: "paid", partially_paid: "pending", partially_refunded: "partially_refunded", refunded: "refunded", voided: "pending" };
const FULFILMENT = { unfulfilled: "unfulfilled", partial: "partially_fulfilled", partially_fulfilled: "partially_fulfilled", fulfilled: "fulfilled", shipped: "fulfilled", delivered: "fulfilled", cancelled: "cancelled", canceled: "cancelled" };

const orderSchema = z.object({
  externalId: extId,
  number: z.coerce.number().int().positive().max(99999999).optional().nullable(),
  email: z.string().trim().toLowerCase().email().max(200).optional().nullable().or(z.literal("").transform(() => null)),
  phone: optStr(30),
  currency: z.string().trim().length(3).optional(),
  createdAt: z.coerce.date(),
  paymentMethod: z.string().trim().max(40).default("cod"),
  paymentStatus: z.string().trim().toLowerCase().default("paid"),
  fulfillmentStatus: z.string().trim().toLowerCase().default("unfulfilled"),
  subtotal: money.optional(),
  shipping: money.default(0),
  tax: money.default(0),
  discount: money.default(0),
  discountCode: optStr(60),
  total: money.optional(),
  refundedAmount: money.default(0),
  note: z.string().max(5000).optional().nullable(),
  customer: z.object({ name: optStr(120), email: z.string().trim().email().max(200).optional().nullable().or(z.literal("").transform(() => null)), phone: optStr(30) }).partial().optional().nullable(),
  shippingAddress: addressSchema.optional().nullable(),
  lineItems: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(255),
        sku: optStr(120),
        variantSku: optStr(120),
        variantTitle: optStr(255),
        quantity: z.coerce.number().int().positive().max(100000),
        price: money,
        productExternalId: extId.optional().nullable(),
      })
    )
    .min(1, "An order needs at least one line item")
    .max(500),
  trackingNumber: optStr(120),
  trackingUrl: z.string().url().max(500).optional().nullable(),
  courier: optStr(80),
  cancelledAt: z.coerce.date().optional().nullable(),
  source: z.string().trim().max(40).default("Shopify"),
});

/**
 * POST /orders/import: a past order, recorded as it was. Nothing happens
 * that a new order would set off — no payment, no stock change, no emails,
 * WhatsApp or webhooks, and no Oyklane commission (it has no fee terms).
 * It keeps its date and, when free, its number. By externalId it's made
 * only once. Returns { order, created, warnings }.
 */
async function importOrder(prisma, store, raw) {
  const b = orderSchema.parse(camel(raw || {}));
  const storeId = store.id;
  const existing = await prisma.order.findUnique({ where: { storeId_externalId: { storeId, externalId: b.externalId } }, select: { id: true } });
  if (existing) return { orderId: existing.id, created: false, warnings: [] };
  const warnings = [];

  // The customer: found or made (an import, so no welcome email).
  const who = { name: b.customer?.name || b.shippingAddress?.name, email: b.customer?.email || b.email, phone: b.customer?.phone || b.phone || b.shippingAddress?.phone, address: b.shippingAddress || undefined };
  let customerId = null;
  if (who.email || who.phone) {
    try {
      customerId = (await upsertCustomer(prisma, storeId, who)).customer.id;
    } catch (err) {
      warnings.push(`The customer wasn't linked (${err.message}).`);
    }
  }

  // Line items → this store's products and variants, where they exist.
  const extIds = [...new Set(b.lineItems.map((l) => l.productExternalId).filter(Boolean))];
  const products = extIds.length ? await prisma.product.findMany({ where: { storeId, externalId: { in: extIds } }, select: { id: true, externalId: true, variants: { select: { id: true, sku: true, title: true } } } }) : [];
  const byExt = new Map(products.map((p) => [p.externalId, p]));
  const items = [];
  for (const l of b.lineItems) {
    const sku = l.variantSku || l.sku || null;
    let product = l.productExternalId ? byExt.get(l.productExternalId) : null;
    let variant = product && (product.variants.find((v) => sku && v.sku && v.sku.toLowerCase() === sku.toLowerCase()) || product.variants.find((v) => l.variantTitle && v.title === l.variantTitle) || (product.variants.length === 1 ? product.variants[0] : null));
    if (!variant && sku) {
      const v = await prisma.productVariant.findFirst({ where: { sku: { equals: sku, mode: "insensitive" }, product: { storeId } }, select: { id: true, productId: true } });
      if (v) {
        variant = v;
        product = product || { id: v.productId };
      }
    }
    items.push({ productId: product?.id || null, variantId: variant?.id || null, title: l.variantTitle && l.variantTitle !== "Default" ? `${l.title} — ${l.variantTitle}` : l.title, sku, quantity: l.quantity, price: l.price, total: Math.round(l.price * l.quantity * 100) / 100 });
  }
  const unlinked = items.filter((i) => !i.productId).length;
  if (unlinked) warnings.push(`${unlinked} line item${unlinked === 1 ? " isn't" : "s aren't"} linked to a product (not found by productExternalId or SKU); kept with their title and price.`);

  const subtotal = b.subtotal ?? Math.round(items.reduce((n, i) => n + i.total, 0) * 100) / 100;
  const total = b.total ?? Math.max(0, subtotal - b.discount + b.shipping + b.tax);
  const paymentStatus = PAYMENT[b.paymentStatus] || "paid";
  let fulfillmentStatus = FULFILMENT[b.fulfillmentStatus] || "unfulfilled";
  const cancelledAt = b.cancelledAt || (fulfillmentStatus === "cancelled" ? b.createdAt : null);
  if (cancelledAt) fulfillmentStatus = "cancelled";
  const ship = b.shippingAddress || {};
  const data = {
    externalId: b.externalId,
    importedAt: new Date(),
    createdAt: b.createdAt,
    customerId,
    paymentStatus,
    fulfillmentStatus,
    subtotal,
    discount: b.discount,
    discountCode: b.discountCode || null,
    shipping: b.shipping,
    tax: b.tax,
    total,
    refundedAmount: Math.min(b.refundedAmount, total),
    currency: (b.currency || store.currency || "INR").toUpperCase(),
    email: b.email || b.customer?.email || null,
    phone: b.phone || b.customer?.phone || ship.phone || null,
    shippingName: ship.name || b.customer?.name || null,
    shippingAddress1: ship.address1 || null,
    shippingAddress2: ship.address2 || null,
    shippingCity: ship.city || null,
    shippingProvince: ship.province || null,
    shippingZip: ship.zip || null,
    shippingCountry: ship.country || null,
    paymentMethod: /^(cod|cash)/i.test(b.paymentMethod) ? "cod" : b.paymentMethod.toLowerCase().slice(0, 40),
    note: b.note || null,
    cancelledAt,
    cancelReason: cancelledAt ? "Cancelled before import" : null,
    statusToken: crypto.randomBytes(18).toString("base64url"),
    confirmationSentAt: b.createdAt, // never send it now
  };

  const write = (orderNumber) =>
    prisma.$transaction(async (tx) => {
      const order = await tx.order.create({ data: { ...data, storeId, orderNumber, items: { create: items } }, include: { items: { select: { id: true, quantity: true } } } });
      if (b.trackingNumber || fulfillmentStatus === "fulfilled") {
        await tx.fulfillment.create({
          data: {
            orderId: order.id,
            storeId,
            courier: b.courier || null,
            trackingNumber: b.trackingNumber || null,
            trackingUrl: trackingUrlFor({ courier: b.courier, trackingNumber: b.trackingNumber, trackingUrl: b.trackingUrl }),
            items: order.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity })),
            shippedAt: b.createdAt,
          },
        });
      }
      await tx.orderEvent.create({
        data: { orderId: order.id, kind: "imported", message: `Imported from ${b.source}${b.number ? ` (order #${b.number})` : ""}`, actorName: "API import", meta: { externalId: b.externalId, number: b.number || null }, createdAt: b.createdAt },
      });
      return order;
    });

  let order;
  // Its own number when that's free; else the next one.
  if (b.number && !(await prisma.order.findUnique({ where: { storeId_orderNumber: { storeId, orderNumber: b.number } }, select: { id: true } }))) {
    order = await write(b.number).catch((e) => (e.code === "P2002" && String(e.meta?.target || "").includes("orderNumber") ? null : conflict(e, "order")));
  }
  if (!order) {
    if (b.number) warnings.push(`Order number ${b.number} is taken in this store, so it got the next free number.`);
    order = await ordersRepository.withNextOrderNumber(prisma, storeId, write).catch((e) => conflict(e, "order"));
  }
  return { orderId: order.id, created: true, warnings };
}

module.exports = { camel, slugify, productBody, categoryIdFor, copyImages, upsertCustomer, updateCustomer, upsertCategory, upsertCollection, upsertDiscount, importOrder, byPhone };
