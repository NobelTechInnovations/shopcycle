const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const discountService = require("../discounts/service");
const shippingService = require("../shipping/service");
const taxService = require("../taxes/service");
const giftCards = require("../gift-cards/service");
const rentals = require("../rentals/service");

const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, refreshed on every write

function generateCartId() {
  return crypto.randomUUID();
}

/** Carts live in Postgres (CartSession) — see its doc comment in
 * schema.prisma for why not Redis. A missing, expired, or unreadable cart
 * reads as empty rather than erroring: a shopper should never see a
 * broken page because their old cart cookie outlived its cart. */
async function readRaw(prisma, storeId, cartId) {
  const empty = { items: [], discountCode: null, giftCardId: null, pendingOrderId: null };
  if (!cartId) return empty;
  const row = await prisma.cartSession.findUnique({ where: { storeId_cartId: { storeId, cartId } } });
  if (!row || row.expiresAt < new Date()) return empty;
  const data = row.data || {};
  return {
    items: Array.isArray(data.items) ? data.items : [],
    discountCode: data.discountCode || null,
    giftCardId: data.giftCardId || null,
    // An online order started from this cart whose payment isn't done yet
    // (checkout/service.js): trying again replaces it rather than adding a
    // second order.
    pendingOrderId: data.pendingOrderId || null,
  };
}

async function writeRaw(prisma, storeId, cartId, data) {
  const expiresAt = new Date(Date.now() + CART_TTL_MS);
  const payload = { items: data.items || [], discountCode: data.discountCode || null, giftCardId: data.giftCardId || null, pendingOrderId: data.pendingOrderId || null };
  await prisma.cartSession.upsert({
    where: { storeId_cartId: { storeId, cartId } },
    update: { data: payload, expiresAt },
    create: { storeId, cartId, data: payload, expiresAt },
  });
  // Lazy sweep of abandoned carts — a handful of rows at a time on ~1% of
  // writes keeps the table bounded without needing a scheduled job.
  if (Math.random() < 0.01) {
    prisma.cartSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
  }
}

// Floating-point arithmetic on percentages (e.g. 299 * 0.1) produces
// values like 29.900000000000002 — round every money figure to cents
// before it leaves this module rather than relying on display-side
// formatting to hide it (the raw number is still what gets stored/compared).
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** A cart line's identity: the variant — or, for a rental, the variant
 * and its dates (the same dress for two different weekends is two lines). */
function lineKey(item) {
  if (!item.rental) return item.variantId;
  const r = item.rental;
  return [item.variantId, r.start, r.end, r.handover || "", r.returnMethod || ""].join("|");
}

/** Re-fetches variant/product data on every read rather than caching it in
 * the cart itself, so a price change (or the product going out of stock)
 * is always reflected — matches how a real cart should behave. Items
 * pointing at a since-deleted variant are silently dropped rather than
 * crashing the cart. Also resolves discount/shipping/tax against the
 * store's current configuration — see the ShippingZone/TaxRate model doc
 * comments for the "no checkout address yet" simplification this rests on. */
/** The photo for a cart line: one whose description names the variant's
 * option (a colour — "Pure Linen Shirt in Olive"), else the first. */
function variantImage(variant) {
  const images = variant.product.images || [];
  const parts = String(variant.title || "")
    .split(" / ")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p && p !== "default");
  for (const part of parts.reverse()) {
    const hit = images.find((img) => String(img.altText || "").toLowerCase().split(/[^a-z0-9]+/).join(" ").includes(part.split(/[^a-z0-9]+/).join(" ")));
    if (hit) return hit.url;
  }
  return images[0]?.url || null;
}

async function hydrateCart(prisma, storeId, cartId, raw) {
  const variantIds = raw.items.map((i) => i.variantId);
  const variants = variantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: variantIds }, product: { storeId } },
        include: { product: { include: { images: { orderBy: { position: "asc" }, take: 12 }, rental: true } } },
      })
    : [];
  const variantsById = Object.fromEntries(variants.map((v) => [v.id, v]));
  // Rentals app: rental lines are priced by their dates; a product being
  // rented can't also sit in the cart as a plain purchase.
  const rentalSettings = variants.some((v) => v.product.rental?.enabled || v.product.rental) ? await rentals.installedSettings(prisma, storeId) : null;

  const items = [];
  const kept = [];
  let changed = false;
  for (const item of raw.items) {
    const variant = variantsById[item.variantId];
    if (!variant) {
      changed = true; // drop stale/removed references
      continue;
    }
    let price = Number(variant.price);
    let extra = {};
    if (item.rental || variant.product.rental?.enabled) {
      const details = item.rental ? rentals.cartLineDetails(variant.product, item.rental, rentalSettings, item.quantity) : null;
      if (!details) {
        changed = true; // no longer rentable, or a plain line for a rental product
        continue;
      }
      price = details.price;
      extra = { rental: details.rental, detail: details.detail };
    }
    kept.push(item);
    items.push({
      key: lineKey(item),
      variantId: variant.id,
      productId: variant.productId,
      title: `${variant.product.title}${variant.title !== "Default" ? ` — ${variant.title}` : ""}`,
      url: `/store/__handle__/products/${variant.product.slug}`, // handle filled in by caller
      image: variantImage(variant),
      price,
      quantity: item.quantity,
      lineTotal: round2(price * item.quantity),
      ...extra,
    });
  }

  if (changed) {
    await writeRaw(prisma, storeId, cartId, {
      items: kept,
      discountCode: raw.discountCode,
      giftCardId: raw.giftCardId,
      pendingOrderId: raw.pendingOrderId,
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

  // A gift card pays for part (or all) of the total — it isn't a discount,
  // so `total` stays the order value and `due` is what's left to pay.
  let giftCard = null;
  if (raw.giftCardId && items.length) {
    const card = await prisma.giftCard.findFirst({ where: { id: raw.giftCardId, storeId } });
    const reason = giftCards.unusableReason(card);
    giftCard = reason ? { last4: card?.last4 || null, amount: 0, error: reason } : giftCards.applied(card, total);
  }

  return {
    cartId,
    item_count,
    items,
    subtotal: round2(subtotal),
    discount,
    shipping,
    tax,
    total,
    gift_card: giftCard,
    due: round2(Math.max(total - (giftCard?.amount || 0), 0)),
  };
}

async function getCart(prisma, storeId, cartId, handle) {
  const id = cartId || generateCartId();
  const raw = await readRaw(prisma, storeId, id);
  const cart = await hydrateCart(prisma, storeId, id, raw);
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

/** A variant with what rental checks need. */
function loadVariant(prisma, storeId, variantId) {
  return prisma.productVariant.findFirst({ where: { id: variantId, product: { storeId } }, include: { product: { include: { rental: true } } } });
}

/** `rental`: { start, end, handover, returnMethod } — required for a
 * product the Rentals app rents out; checked against its rules and
 * bookings before it goes in. */
async function addItem(prisma, storeId, cartId, variantId, quantity, handle, { rental } = {}) {
  const variant = await loadVariant(prisma, storeId, variantId);
  if (!variant) throw new HttpError(404, "Product variant not found");
  const id = cartId || generateCartId();
  const raw = await readRaw(prisma, storeId, id);
  const settings = variant.product.rental?.enabled ? await rentals.installedSettings(prisma, storeId) : null;
  // Set up for renting, but the Rentals app is gone: not for sale either.
  if (variant.product.rental?.enabled && !settings) throw new HttpError(400, "This product isn't available right now.");
  if (settings) {
    if (!rental?.start) throw new HttpError(400, "Pick your rental dates first.");
    const probe = { variantId, rental: { start: rental.start, end: rental.end || rental.start, handover: rental.handover, returnMethod: rental.returnMethod } };
    const existing = raw.items.find((i) => i.rental && lineKey(i) === lineKey(probe));
    const others = raw.items.filter((i) => i !== existing);
    const checked = await rentals.cartRental(prisma, storeId, { variant, input: rental, quantity: quantity + (existing?.quantity || 0), otherLines: others, settings });
    if (existing) existing.quantity += quantity;
    else raw.items.push({ variantId, productId: variant.productId, quantity, rental: checked });
  } else {
    const existing = raw.items.find((i) => i.variantId === variantId && !i.rental);
    if (existing) existing.quantity += quantity;
    else raw.items.push({ variantId, quantity });
  }
  await writeRaw(prisma, storeId, id, raw);
  return getCart(prisma, storeId, id, handle);
}

/** Changes a line's quantity (0 removes it). `key` picks the line; older
 * forms send only the variant. */
async function updateItem(prisma, storeId, cartId, variantId, quantity, handle, { key } = {}) {
  if (!cartId) throw new HttpError(400, "Missing cart");
  const raw = await readRaw(prisma, storeId, cartId);
  let idx = key ? raw.items.findIndex((i) => lineKey(i) === key) : -1;
  if (idx < 0 && variantId) {
    idx = raw.items.findIndex((i) => i.variantId === variantId && !i.rental);
    if (idx < 0) idx = raw.items.findIndex((i) => i.variantId === variantId);
  }
  if (quantity <= 0) {
    if (idx >= 0) raw.items.splice(idx, 1);
  } else if (idx >= 0) {
    const line = raw.items[idx];
    if (line.rental && quantity > line.quantity) {
      // More pieces for the same dates: they have to be free too.
      const variant = await loadVariant(prisma, storeId, line.variantId);
      const settings = variant && (await rentals.installedSettings(prisma, storeId));
      if (variant && settings) {
        await rentals.cartRental(prisma, storeId, { variant, input: line.rental, quantity, otherLines: raw.items.filter((_, i) => i !== idx), settings });
      }
    }
    line.quantity = quantity;
  } else if (variantId) {
    const variant = await loadVariant(prisma, storeId, variantId);
    if (!variant) throw new HttpError(404, "Product variant not found");
    if (variant.product.rental?.enabled && (await rentals.installedSettings(prisma, storeId))) throw new HttpError(400, "Pick your rental dates on the product page.");
    raw.items.push({ variantId, quantity });
  }
  await writeRaw(prisma, storeId, cartId, raw);
  return getCart(prisma, storeId, cartId, handle);
}

async function applyDiscountCode(prisma, storeId, cartId, code, handle) {
  if (!cartId) throw new HttpError(400, "Missing cart");
  const raw = await readRaw(prisma, storeId, cartId);
  // Validate against the real current subtotal before saving, so an
  // invalid code never silently "applies."
  const cartPreview = await hydrateCart(prisma, storeId, cartId, raw);
  await discountService.resolveApplicableDiscount(prisma, storeId, code, cartPreview.subtotal);
  raw.discountCode = code.toUpperCase().trim();
  await writeRaw(prisma, storeId, cartId, raw);
  return getCart(prisma, storeId, cartId, handle);
}

async function removeDiscountCode(prisma, storeId, cartId, handle) {
  if (!cartId) throw new HttpError(400, "Missing cart");
  const raw = await readRaw(prisma, storeId, cartId);
  raw.discountCode = null;
  await writeRaw(prisma, storeId, cartId, raw);
  return getCart(prisma, storeId, cartId, handle);
}

/** Checks a gift card code and attaches the card to the cart. The code
 * itself is never stored in the cart — only the card's id. */
async function applyGiftCard(prisma, storeId, cartId, code, handle) {
  if (!cartId) throw new HttpError(400, "Missing cart");
  const card = await giftCards.findByCode(prisma, storeId, code);
  const reason = giftCards.unusableReason(card);
  if (reason) throw new HttpError(400, reason);
  const raw = await readRaw(prisma, storeId, cartId);
  raw.giftCardId = card.id;
  await writeRaw(prisma, storeId, cartId, raw);
  return getCart(prisma, storeId, cartId, handle);
}

async function removeGiftCard(prisma, storeId, cartId, handle) {
  if (!cartId) throw new HttpError(400, "Missing cart");
  const raw = await readRaw(prisma, storeId, cartId);
  raw.giftCardId = null;
  await writeRaw(prisma, storeId, cartId, raw);
  return getCart(prisma, storeId, cartId, handle);
}

/** Marks the cart as paying for `orderId` (an online order waiting for its
 * payment) — checking out again from it replaces that order. */
async function setPendingOrder(prisma, storeId, cartId, orderId) {
  if (!cartId) return;
  const raw = await readRaw(prisma, storeId, cartId);
  await writeRaw(prisma, storeId, cartId, { ...raw, pendingOrderId: orderId });
}

/** Called once checkout successfully places a real order — the cart's job
 * is done, and leaving the old items in place would let the same cartId
 * "place" the same order again on a page back-navigation. */
function clearCart(prisma, storeId, cartId) {
  return prisma.cartSession.deleteMany({ where: { storeId, cartId } });
}

module.exports = {
  getCart,
  setPendingOrder,
  addItem,
  updateItem,
  applyDiscountCode,
  removeDiscountCode,
  applyGiftCard,
  removeGiftCard,
  generateCartId,
  clearCart,
  hydrateCart,
  readRaw,
  round2,
  lineKey,
};
