const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const discountService = require("../discounts/service");
const shippingService = require("../shipping/service");
const taxService = require("../taxes/service");

const CART_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function redisKey(storeId, cartId) {
  return `cart:${storeId}:${cartId}`;
}

function generateCartId() {
  return crypto.randomUUID();
}

async function readRaw(redis, storeId, cartId) {
  if (!cartId) return { items: [], discountCode: null };
  const raw = await redis.get(redisKey(storeId, cartId));
  if (!raw) return { items: [], discountCode: null };
  try {
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      discountCode: parsed.discountCode || null,
    };
  } catch {
    return { items: [], discountCode: null };
  }
}

function writeRaw(redis, storeId, cartId, data) {
  return redis.set(redisKey(storeId, cartId), JSON.stringify(data), "EX", CART_TTL_SECONDS);
}

// Floating-point arithmetic on percentages (e.g. 299 * 0.1) produces
// values like 29.900000000000002 — round every money figure to cents
// before it leaves this module rather than relying on display-side
// formatting to hide it (the raw number is still what gets stored/compared).
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Re-fetches variant/product data on every read rather than caching it in
 * the cart itself, so a price change (or the product going out of stock)
 * is always reflected — matches how a real cart should behave. Items
 * pointing at a since-deleted variant are silently dropped rather than
 * crashing the cart. Also resolves discount/shipping/tax against the
 * store's current configuration — see the ShippingZone/TaxRate model doc
 * comments for the "no checkout address yet" simplification this rests on. */
async function hydrateCart(prisma, redis, storeId, cartId, raw) {
  const variantIds = raw.items.map((i) => i.variantId);
  const variants = variantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: variantIds }, product: { storeId } },
        include: { product: { include: { images: { orderBy: { position: "asc" }, take: 1 } } } },
      })
    : [];
  const variantsById = Object.fromEntries(variants.map((v) => [v.id, v]));

  const items = [];
  let changed = false;
  for (const item of raw.items) {
    const variant = variantsById[item.variantId];
    if (!variant) {
      changed = true; // drop stale/removed references
      continue;
    }
    const price = Number(variant.price);
    items.push({
      variantId: variant.id,
      productId: variant.productId,
      title: `${variant.product.title}${variant.title !== "Default" ? ` — ${variant.title}` : ""}`,
      url: `/store/__handle__/products/${variant.product.slug}`, // handle filled in by caller
      image: variant.product.images[0]?.url || null,
      price,
      quantity: item.quantity,
      lineTotal: price * item.quantity,
    });
  }

  if (changed) {
    await writeRaw(redis, storeId, cartId, {
      items: raw.items.filter((i) => variantsById[i.variantId]),
      discountCode: raw.discountCode,
    });
  }

  const item_count = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);

  let discount = null;
  if (raw.discountCode) {
    try {
      const record = await discountService.resolveApplicableDiscount(prisma, storeId, raw.discountCode, subtotal);
      discount = {
        code: record.code,
        amount: round2(discountService.calculateDiscountAmount(record, subtotal)),
      };
    } catch (err) {
      // The code stopped being valid (expired, usage limit hit) between
      // being applied and now — surface that instead of pretending it's
      // still saving the shopper money.
      discount = { code: raw.discountCode, amount: 0, error: err.message };
    }
  }
  const discountAmount = discount?.amount || 0;

  // An empty cart has nothing to ship and nothing to tax — estimating
  // either against a zero subtotal would show a flat shipping fee on a
  // cart with no items in it, which is wrong regardless of what the rate
  // table says.
  const shipping = items.length > 0 ? await shippingService.estimateShipping(prisma, storeId, subtotal) : null;
  const shippingAmount = shipping?.amount || 0;

  const taxableAmount = Math.max(subtotal - discountAmount, 0);
  const taxEstimate = items.length > 0 ? await taxService.estimateTax(prisma, storeId, taxableAmount) : null;
  const tax = taxEstimate ? { ...taxEstimate, amount: round2(taxEstimate.amount) } : null;
  const taxAmount = tax?.amount || 0;

  const total = round2(Math.max(subtotal - discountAmount + shippingAmount + taxAmount, 0));

  return {
    cartId,
    item_count,
    items,
    subtotal: round2(subtotal),
    discount,
    shipping,
    tax,
    total,
  };
}

async function getCart(prisma, redis, storeId, cartId, handle) {
  const id = cartId || generateCartId();
  const raw = await readRaw(redis, storeId, id);
  const cart = await hydrateCart(prisma, redis, storeId, id, raw);
  if (handle) cart.items.forEach((i) => (i.url = i.url.replace("__handle__", handle)));
  return cart;
}

async function assertVariantBelongsToStore(prisma, storeId, variantId) {
  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, product: { storeId } },
  });
  if (!variant) throw new HttpError(404, "Product variant not found");
  return variant;
}

async function addItem(prisma, redis, storeId, cartId, variantId, quantity, handle) {
  await assertVariantBelongsToStore(prisma, storeId, variantId);
  const id = cartId || generateCartId();
  const raw = await readRaw(redis, storeId, id);
  const existing = raw.items.find((i) => i.variantId === variantId);
  if (existing) existing.quantity += quantity;
  else raw.items.push({ variantId, quantity });
  await writeRaw(redis, storeId, id, raw);
  return getCart(prisma, redis, storeId, id, handle);
}

async function updateItem(prisma, redis, storeId, cartId, variantId, quantity, handle) {
  if (!cartId) throw new HttpError(400, "Missing cart");
  const raw = await readRaw(redis, storeId, cartId);
  const idx = raw.items.findIndex((i) => i.variantId === variantId);
  if (quantity <= 0) {
    if (idx >= 0) raw.items.splice(idx, 1);
  } else if (idx >= 0) {
    raw.items[idx].quantity = quantity;
  } else {
    raw.items.push({ variantId, quantity });
  }
  await writeRaw(redis, storeId, cartId, raw);
  return getCart(prisma, redis, storeId, cartId, handle);
}

async function applyDiscountCode(prisma, redis, storeId, cartId, code, handle) {
  if (!cartId) throw new HttpError(400, "Missing cart");
  const raw = await readRaw(redis, storeId, cartId);
  // Validate against the real current subtotal before saving, so an
  // invalid code never silently "applies."
  const cartPreview = await hydrateCart(prisma, redis, storeId, cartId, raw);
  await discountService.resolveApplicableDiscount(prisma, storeId, code, cartPreview.subtotal);
  raw.discountCode = code.toUpperCase().trim();
  await writeRaw(redis, storeId, cartId, raw);
  return getCart(prisma, redis, storeId, cartId, handle);
}

async function removeDiscountCode(prisma, redis, storeId, cartId, handle) {
  if (!cartId) throw new HttpError(400, "Missing cart");
  const raw = await readRaw(redis, storeId, cartId);
  raw.discountCode = null;
  await writeRaw(redis, storeId, cartId, raw);
  return getCart(prisma, redis, storeId, cartId, handle);
}

/** Called once checkout successfully places a real order — the cart's job
 * is done, and leaving the old items in place would let the same cartId
 * "place" the same order again on a page back-navigation. */
function clearCart(redis, storeId, cartId) {
  return redis.del(redisKey(storeId, cartId));
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  applyDiscountCode,
  removeDiscountCode,
  generateCartId,
  clearCart,
  hydrateCart,
  readRaw,
  round2,
};
