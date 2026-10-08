const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { createDiscountSchema } = require("@shopcycle/validation");
const repository = require("./repository");
const { PLACED } = require("../orders/placed");

/**
 * Discounts: a code shoppers enter, or automatic (applies by itself).
 *   percentage / fixed_amount  off the order, or off chosen products or
 *                              collections (a percentage can be capped)
 *   free_shipping              delivery free
 *   buy_x_get_y                buy N eligible items, get M more at value% off
 * Minimums (amount, quantity), dates, a total usage limit and once per
 * customer. One discount per order: a code the shopper enters wins over
 * an automatic one; among automatic ones, the biggest saving.
 */

const round2 = (n) => Math.round(n * 100) / 100;

/** "scheduled" | "active" | "expired" | "disabled", as the shopper sees it. */
function effectiveStatus(d, now = new Date()) {
  if (d.status !== "active") return "disabled";
  if (d.startsAt && now < new Date(d.startsAt)) return "scheduled";
  if (d.endsAt && now > new Date(d.endsAt)) return "expired";
  if (d.usageLimit && d.usageCount >= d.usageLimit) return "expired";
  return "active";
}

async function listDiscounts(prisma, storeId, query) {
  const [discounts, total, all] = await repository.list(prisma, storeId, query);
  const counts = { all: all.length, active: 0, scheduled: 0, expired: 0, disabled: 0 };
  for (const d of all) counts[effectiveStatus(d)] += 1;
  return { discounts: discounts.map(withStatus), total, page: query.page, pageSize: query.pageSize, counts, summary: await summary(prisma, storeId) };
}

const withStatus = (d) => ({ ...d, effectiveStatus: effectiveStatus(d) });

/** The last 30 days: orders that used a discount, what they sold and what they saved. */
async function summary(prisma, storeId) {
  const since = new Date(Date.now() - 30 * 86400_000);
  const agg = await prisma.order.aggregate({
    where: { storeId, createdAt: { gte: since }, cancelledAt: null, discount: { gt: 0 }, ...PLACED },
    _count: { _all: true },
    _sum: { total: true, discount: true },
  });
  return { orders30: agg._count._all, sales30: Number(agg._sum.total || 0), saved30: Number(agg._sum.discount || 0) };
}

async function getDiscount(prisma, storeId, id) {
  const discount = await repository.findById(prisma, storeId, id);
  if (!discount) throw new HttpError(404, "Discount not found");
  return withStatus(discount);
}

const autoCode = () => `AUTO-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

function clean(input) {
  const data = { ...input };
  if (data.method === "automatic" && !data.code) data.code = autoCode();
  if (data.appliesTo === "order") data.targetIds = [];
  if (data.type && data.type !== "buy_x_get_y") Object.assign(data, { buyQuantity: null, getQuantity: null });
  if (data.type === "free_shipping") data.value = 0;
  if (data.type && data.type !== "percentage") data.maxDiscount = null;
  return data;
}

async function createDiscount(prisma, storeId, input) {
  const data = clean(input.method === "automatic" && !input.code ? { ...input, code: autoCode() } : input);
  const existing = await repository.findByCode(prisma, storeId, data.code);
  if (existing) throw new HttpError(409, `A discount with code "${data.code}" already exists`);
  return withStatus(await repository.create(prisma, storeId, data));
}

async function updateDiscount(prisma, storeId, id, input) {
  const current = await getDiscount(prisma, storeId, id);
  // The edit has to make sense with what's already there.
  const merged = { ...current, value: Number(current.value), minSubtotal: current.minSubtotal == null ? null : Number(current.minSubtotal), maxDiscount: current.maxDiscount == null ? null : Number(current.maxDiscount), ...input };
  const check = createDiscountSchema.safeParse(merged);
  if (!check.success) throw check.error;
  if (input.code) {
    const existing = await repository.findByCode(prisma, storeId, input.code, id);
    if (existing) throw new HttpError(409, `A discount with code "${input.code}" already exists`);
  }
  return withStatus(await repository.update(prisma, id, clean({ ...input, type: input.type || current.type, appliesTo: input.appliesTo || current.appliesTo })));
}

async function deleteDiscount(prisma, storeId, id) {
  await getDiscount(prisma, storeId, id);
  await repository.remove(prisma, id);
}

/** A copy to edit — disabled until the seller turns it on. */
async function duplicateDiscount(prisma, storeId, id) {
  const d = await getDiscount(prisma, storeId, id);
  const { id: _id, createdAt: _c, updatedAt: _u, usageCount: _n, effectiveStatus: _s, storeId: _st, ...rest } = d;
  let code = d.method === "automatic" ? autoCode() : `${d.code}-COPY`.slice(0, 40);
  for (let i = 2; await repository.findByCode(prisma, storeId, code); i += 1) code = `${d.code}-COPY${i}`.slice(0, 40);
  return withStatus(await repository.create(prisma, storeId, { ...rest, code, title: d.title ? `${d.title} (copy)` : d.title, status: "disabled" }));
}

// ── Applying ─────────────────────────────────────────────────────────

/** The cart's lines a discount covers. `inCollections` maps productId →
 * its collection ids (only needed for collection discounts). */
function eligibleLines(discount, items, inCollections) {
  if (discount.appliesTo === "products") return items.filter((i) => discount.targetIds.includes(i.productId));
  if (discount.appliesTo === "collections") return items.filter((i) => (inCollections.get(i.productId) || []).some((c) => discount.targetIds.includes(c)));
  return items;
}

/** Why it can't be used on this cart, or null. */
function blockedReason(d, { subtotal, lines }) {
  const status = effectiveStatus(d);
  if (status === "disabled") return "This discount code is no longer active";
  if (status === "scheduled") return "This discount code isn't active yet";
  if (status === "expired") return d.usageLimit && d.usageCount >= d.usageLimit ? "This discount code has reached its usage limit" : "This discount code has expired";
  if (d.minSubtotal && subtotal < Number(d.minSubtotal)) return `This code needs an order of at least ₹${Number(d.minSubtotal)}`;
  const qty = lines.reduce((n, i) => n + i.quantity, 0);
  if (d.appliesTo !== "order" && qty === 0) return `This code is for ${d.appliesTo === "products" ? "other products" : "another collection"}`;
  if (d.minQuantity && qty < d.minQuantity) return `Add ${d.minQuantity - qty} more eligible item${d.minQuantity - qty === 1 ? "" : "s"} to use this code`;
  if (d.type === "buy_x_get_y" && qty < (d.buyQuantity || 1) + (d.getQuantity || 1)) {
    const need = (d.buyQuantity || 1) + (d.getQuantity || 1) - qty;
    return `Add ${need} more eligible item${need === 1 ? "" : "s"} to get this offer`;
  }
  return null;
}

/** What it takes off: { amount, freeShipping }. */
function savings(d, lines) {
  const eligible = lines.reduce((n, i) => n + i.lineTotal, 0);
  if (d.type === "free_shipping") return { amount: 0, freeShipping: true };
  if (d.type === "fixed_amount") return { amount: round2(Math.min(Number(d.value), eligible)), freeShipping: false };
  if (d.type === "percentage") {
    const off = eligible * (Number(d.value) / 100);
    return { amount: round2(d.maxDiscount ? Math.min(off, Number(d.maxDiscount)) : off), freeShipping: false };
  }
  // Buy X get Y: in every group of X+Y items (most expensive first), the
  // Y cheapest are the "get" ones.
  const units = lines.flatMap((i) => Array.from({ length: i.quantity }, () => i.price)).sort((a, b) => b - a);
  const group = (d.buyQuantity || 1) + (d.getQuantity || 1);
  let off = 0;
  for (let g = 0; g + group <= units.length; g += group) {
    for (const price of units.slice(g + (d.buyQuantity || 1), g + group)) off += price * (Number(d.value) / 100);
  }
  return { amount: round2(off), freeShipping: false };
}

async function collectionsOf(prisma, items) {
  const ids = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await prisma.collectionProduct.findMany({ where: { productId: { in: ids } }, select: { productId: true, collectionId: true } });
  const map = new Map();
  for (const r of rows) map.set(r.productId, [...(map.get(r.productId) || []), r.collectionId]);
  return map;
}

/**
 * The cart's discount: the code it has, else the best automatic one.
 * Returns null, or { id, code (what the shopper sees), amount,
 * free_shipping, automatic, once, error? }.
 */
async function forCart(prisma, storeId, { code, items, subtotal }) {
  let inCollections = null;
  const lines = async (d) => {
    if (d.appliesTo === "collections" && !inCollections) inCollections = await collectionsOf(prisma, items);
    return eligibleLines(d, items, inCollections);
  };
  if (code) {
    const d = await repository.findByCode(prisma, storeId, String(code).toUpperCase().trim());
    if (!d) return { code, amount: 0, error: "Discount code not found" };
    const l = await lines(d);
    const reason = blockedReason(d, { subtotal, lines: l });
    const label = d.method === "automatic" ? d.title || d.code : d.code;
    if (reason) return { code: label, amount: 0, error: reason };
    const s = savings(d, l);
    return { id: d.id, code: label, amount: s.amount, free_shipping: s.freeShipping, automatic: false, once: d.oncePerCustomer };
  }
  if (!items.length) return null;
  const autos = await prisma.discount.findMany({ where: { storeId, method: "automatic", status: "active" } });
  let best = null;
  for (const d of autos) {
    const l = await lines(d);
    if (blockedReason(d, { subtotal, lines: l })) continue;
    const s = savings(d, l);
    if (s.amount <= 0 && !s.freeShipping) continue;
    if (!best || s.amount > best.amount) best = { id: d.id, code: d.title || "Discount", amount: s.amount, free_shipping: s.freeShipping, automatic: true, once: d.oncePerCustomer };
  }
  return best;
}

/** Checks a code before it's saved on a cart (same rules as forCart). */
async function resolveApplicableDiscount(prisma, storeId, code, cartPreview) {
  const result = await forCart(prisma, storeId, { code, items: cartPreview.items || [], subtotal: cartPreview.subtotal || 0 });
  if (result?.error) throw new HttpError(result.error === "Discount code not found" ? 404 : 400, result.error);
  return result;
}

/** Once per customer: has this email already placed an order with it? */
async function assertUnusedBy(prisma, storeId, discount, email) {
  if (!discount?.once || !discount.id || !email) return;
  const used = await prisma.order.findFirst({ where: { storeId, email: String(email).toLowerCase(), discountCode: discount.code, cancelledAt: null, ...PLACED }, select: { id: true } });
  if (used) throw new HttpError(400, `You've already used "${discount.code}" — it's one per customer. Remove it to continue.`);
}

/** Called once an order actually places (checkout/service.js). */
function recordUsage(prisma, id) {
  return repository.incrementUsage(prisma, id);
}

module.exports = {
  effectiveStatus,
  listDiscounts,
  getDiscount,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  duplicateDiscount,
  forCart,
  resolveApplicableDiscount,
  assertUnusedBy,
  recordUsage,
};
