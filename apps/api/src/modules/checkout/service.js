const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { safeEqual } = require("../../lib/crypto");
const { syncOrderCommission } = require("../billing/commission");
const cartService = require("../cart/service");
const discountService = require("../discounts/service");
const customersRepository = require("../customers/repository");
const ordersRepository = require("../orders/repository");
const { adjustStock } = require("../../lib/inventory");
const { addOrderEvent } = require("../orders/events");
const notify = require("../orders/notify");
const giftCards = require("../gift-cards/service");

function razorpayConfigured() {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

/** Cash on Delivery needs no external service and is always offered;
 * online payment only appears once a merchant's own Razorpay keys are
 * configured (env vars, never something typed into this app) — no fake
 * "test success" button standing in for a real gateway. */
function availablePaymentMethods() {
  const methods = [{ value: "cod", label: "Cash on Delivery" }];
  if (razorpayConfigured()) methods.push({ value: "razorpay", label: "Pay online (Razorpay)" });
  return methods;
}

async function getCheckoutContext(prisma, storeId, cartId, handle) {
  const cart = await cartService.getCart(prisma, storeId, cartId, handle);
  return { cart, paymentMethods: availablePaymentMethods() };
}

async function createRazorpayOrder(amountInRupees, receipt) {
  const amountPaise = Math.round(amountInRupees * 100);
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`${env.RAZORPAY_API_URL}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpError(502, `Razorpay order creation failed: ${body || res.statusText}`);
  }
  return res.json();
}

/** Creates a real Order from the shopper's current cart — re-hydrated here
 * (never trusting client-submitted totals) so the price/discount/shipping/
 * tax actually charged is always what the store's current configuration
 * says it should be, not whatever the checkout form happened to render. */
async function placeOrder(prisma, storeId, cartId, handle, input, { store, shopper = null, log } = {}) {
  input = { ...input, email: String(input.email).trim().toLowerCase() };
  const raw = await cartService.readRaw(prisma, storeId, cartId);
  const cart = await cartService.hydrateCart(prisma, storeId, cartId, raw);
  if (cart.items.length === 0) throw new HttpError(400, "Your cart is empty");
  if (cart.discount?.error) throw new HttpError(400, cart.discount.error);
  if (cart.gift_card?.error) throw new HttpError(400, `${cart.gift_card.error} Remove it from your cart to continue.`);
  // A gift card covering the whole order leaves nothing to collect.
  const giftCard = cart.gift_card && cart.gift_card.amount > 0 ? cart.gift_card : null;
  const due = cart.due;
  if (due <= 0) input = { ...input, paymentMethod: "gift_card" };
  else if (input.paymentMethod === "gift_card") {
    throw new HttpError(400, "Your gift card no longer covers the whole order. Choose how to pay the rest.");
  }
  if (input.paymentMethod === "razorpay" && !razorpayConfigured()) {
    throw new HttpError(400, "Online payment isn't available for this store yet");
  }

  // Only trust a session id that actually belongs to this store — it
  // arrives from a cookie the client controls, so a stale/cross-store
  // value should just be ignored rather than attributed to the wrong
  // store's traffic.
  let session = null;
  if (input.sessionId) {
    session = await prisma.visitorSession.findFirst({ where: { id: input.sessionId, storeId } });
  }

  // Guest checkout still creates/updates a real Customer record — this is
  // what lets a returning shopper's order show up under one customer, and
  // matches how their info populates a future visit (address in cart is
  // still Phase-out-of-scope, so it's captured fresh at checkout).
  const customerFields = {
    name: input.shippingName,
    phone: input.phone,
    address1: input.shippingAddress1,
    address2: input.shippingAddress2 || null,
    city: input.shippingCity,
    province: input.shippingProvince,
    zip: input.shippingZip,
    country: input.shippingCountry,
    // Consent is only ever given here, never taken away: unticking the box
    // on a later order doesn't unsubscribe someone who opted in before.
    ...(input.acceptsMarketing && { acceptsEmailMarketing: true }),
  };
  // Signed in and checking out with the account's own email: the order
  // belongs to the account. A guest using an account's email still gets
  // the order recorded, but can't change what the account has saved.
  const signedIn = Boolean(shopper && shopper.email.toLowerCase() === input.email);
  const existingCustomer = signedIn ? shopper : await customersRepository.findByEmail(prisma, storeId, input.email);
  const customer = !existingCustomer
    ? await customersRepository.create(prisma, storeId, { email: input.email, ...customerFields })
    : existingCustomer.passwordHash && !signedIn
      ? existingCustomer
      : await customersRepository.update(prisma, existingCustomer.id, customerFields);

  const orderItems = cart.items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    title: item.title,
    quantity: item.quantity,
    price: item.price,
    total: Math.round((item.price * item.quantity + Number.EPSILON) * 100) / 100,
  }));

  const orderData = {
    customerId: customer.id,
    subtotal: cart.subtotal,
    discount: cart.discount?.amount || 0,
    discountCode: cart.discount?.code || null,
    shipping: cart.shipping?.amount || 0,
    tax: cart.tax?.amount || 0,
    total: cart.total,
    email: input.email,
    phone: input.phone,
    shippingName: input.shippingName,
    shippingAddress1: input.shippingAddress1,
    shippingAddress2: input.shippingAddress2 || null,
    shippingCity: input.shippingCity,
    shippingProvince: input.shippingProvince,
    shippingZip: input.shippingZip,
    shippingCountry: input.shippingCountry,
    paymentMethod: input.paymentMethod,
    sessionId: session?.id || null,
    giftCardAmount: giftCard?.amount || 0,
    giftCardId: giftCard?.id || null,
    placedSignedIn: signedIn,
    ...(due <= 0 && { paymentStatus: "paid" }),
  };

  // Decrement inventory and create the order in one transaction — an order
  // that exists without the stock move (or vice versa) is worse than a
  // checkout that fails outright. If a simultaneous checkout takes the same
  // order number, the whole transaction rolls back and retries with the
  // next one, so stock is never decremented twice.
  const order = await ordersRepository.withNextOrderNumber(prisma, storeId, (orderNumber) => prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: { ...orderData, storeId, orderNumber, items: { create: orderItems } },
      include: { customer: true, items: true },
    });
    // Not erroring on insufficient stock: there's no reservation/lock step
    // before checkout in this model, so — same tradeoff most small
    // storefronts make — let the sale through and leave a backorder for
    // the merchant to handle rather than losing it at the last step. Each
    // move is recorded in the inventory history (lib/inventory.js).
    for (const item of created.items) {
      if (!item.variantId) continue;
      await adjustStock(tx, { storeId, variantId: item.variantId, delta: -item.quantity, reason: "sold", orderId: created.id });
    }
    // Spent in the same transaction as the order: if the card's balance
    // changed since the cart was loaded, nothing is created or charged.
    if (giftCard) await giftCards.redeem(tx, giftCard, created.id, giftCard.amount);
    await addOrderEvent(
      tx,
      created.id,
      {
        kind: "placed",
        message: `Order placed on the online store · ${
          input.paymentMethod === "gift_card" ? "paid with a gift card" : input.paymentMethod === "cod" ? "cash on delivery" : "paying online"
        }${giftCard && input.paymentMethod !== "gift_card" ? ` · gift card ••••${giftCard.last4} used for ${giftCard.amount}` : ""}`,
        actorName: "Customer",
      },
      { strict: true }
    );
    return created;
  }));

  if (cart.discount?.code) {
    const discountRecord = await discountService
      .resolveApplicableDiscount(prisma, storeId, cart.discount.code, cart.subtotal)
      .catch(() => null);
    if (discountRecord) await discountService.recordUsage(prisma, discountRecord.id);
  }

  // Not routed through analytics/service.js — that module imports
  // storefront/service.js, which imports this one, and a third leg back
  // here would be a require() cycle. The update itself is one line.
  if (session && !session.customerId) {
    await prisma.visitorSession.update({ where: { id: session.id }, data: { customerId: customer.id } });
  }

  let razorpay = null;
  if (input.paymentMethod === "razorpay") {
    const rp = await createRazorpayOrder(due, order.id);
    razorpay = { orderId: rp.id, amount: rp.amount, currency: rp.currency, keyId: env.RAZORPAY_KEY_ID };
    await prisma.order.update({ where: { id: order.id }, data: { razorpayOrderId: rp.id } });
  }

  // The cart's job ends here either way — COD is fully placed, and a
  // Razorpay order already exists server-side even if the shopper abandons
  // the payment modal next (their order sits pending, same as any real
  // gateway checkout that gets interrupted after the order is created).
  await cartService.clearCart(prisma, storeId, cartId);

  // Cash on delivery is final now; an online order is confirmed (and
  // emailed) once its payment is verified.
  if (input.paymentMethod === "gift_card") await syncOrderCommission(prisma, order.id);
  if (input.paymentMethod !== "razorpay" && store) {
    await notify.sendOrderPlaced(prisma, store, order, log).catch((err) => log?.error({ err }, "checkout: confirmation email failed"));
  }

  return { order, razorpay };
}

async function getOrderForConfirmation(prisma, storeId, id) {
  const order = await ordersRepository.findById(prisma, storeId, id);
  if (!order) throw new HttpError(404, "Order not found");
  return order;
}

/** HMAC-SHA256 signature check per Razorpay's documented verification
 * scheme — the only trustworthy signal that a payment actually succeeded
 * (the client-side "handler" callback firing is not, by itself, proof of
 * anything: it can be forged by anyone who can call this endpoint). */
async function verifyRazorpayPayment(prisma, { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }, { log } = {}) {
  if (!razorpayConfigured()) throw new HttpError(400, "Online payment isn't configured");
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  if (!safeEqual(expected, razorpay_signature)) throw new HttpError(400, "Payment verification failed");

  // The signature proves a real payment happened for `razorpay_order_id` —
  // it says nothing about OUR order `orderId`. Without this check, a valid
  // signature from paying for a cheap order could be replayed to mark any
  // other (expensive) order as paid. Our order must be the one Razorpay
  // order was created for at checkout.
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !order.razorpayOrderId || !safeEqual(order.razorpayOrderId, razorpay_order_id)) {
    throw new HttpError(400, "Payment verification failed");
  }
  if (order.paymentStatus === "paid") {
    // Already confirmed (a double-submitted callback) — nothing to change.
    return prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, items: true } });
  }

  // Conditional on still pending, so a double-submitted callback can't
  // record the payment (or send the confirmation) twice.
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, paymentStatus: "pending" },
    data: { paymentStatus: "paid", razorpayPaymentId: razorpay_payment_id },
  });
  const paid = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, items: true } });
  if (count === 1) {
    await addOrderEvent(prisma, orderId, { kind: "paid", message: `Payment received online (Razorpay ${razorpay_payment_id})` });
    await syncOrderCommission(prisma, paid.id);
    const store = await prisma.store.findUnique({ where: { id: paid.storeId }, include: { plan: true } });
    await notify.sendOrderPlaced(prisma, store, paid, log).catch((err) => log?.error({ err }, "checkout: confirmation email failed"));
  }
  return paid;
}

module.exports = {
  getCheckoutContext,
  placeOrder,
  getOrderForConfirmation,
  verifyRazorpayPayment,
  availablePaymentMethods,
};
