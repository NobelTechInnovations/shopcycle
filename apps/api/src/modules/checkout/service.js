const { HttpError } = require("@shopcycle/utils");
const { syncOrderCommission, feeSnapshot } = require("../billing/commission");
const cartService = require("../cart/service");
const discountService = require("../discounts/service");
const customersRepository = require("../customers/repository");
const ordersRepository = require("../orders/repository");
const { adjustStock } = require("../../lib/inventory");
const { addOrderEvent } = require("../orders/events");
const notify = require("../orders/notify");
const giftCards = require("../gift-cards/service");
const payments = require("../payments/service");
const webhooks = require("../developer/webhooks");
const { storeSettings } = require("../../lib/store-settings");
const { cancelOrder } = require("../orders/operations");
const shopperService = require("../shopper/service");
const shopperPhone = require("../shopper/phone");
const abandoned = require("./abandoned");
const rentals = require("../rentals/service");
const { REPLACED_REASON } = ordersRepository;

/** What checkout offers: cash on delivery (Settings ▸ Payments) and each
 * gateway the seller connected with their own account — shoppers' money
 * goes to the seller, never through the platform. */
async function availablePaymentMethods(prisma, store) {
  return payments.checkoutMethods(prisma, store);
}

async function getCheckoutContext(prisma, store, cartId) {
  const cart = await cartService.getCart(prisma, store.id, cartId, store.handle);
  return { cart, paymentMethods: await availablePaymentMethods(prisma, store) };
}

/** Where a gateway sends the shopper back: the storefront's own return
 * route, on whatever address they're shopping on (sent by the storefront). */
function returnUrls(base, provider, orderId) {
  const root = String(base || "").replace(/\/+$/, "");
  const back = `${root}/checkout/return/${provider}?order=${encodeURIComponent(orderId)}`;
  // A cancel comes back through the same return route: it asks the gateway
  // (a "cancel" can still be a finished payment) and then sends the shopper
  // wherever they started — the one-click popup's page, or checkout.
  return { return: back, cancel: `${back}&cancelled=1` };
}

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * The checkout form as this store has set it up (Settings ▸ Checkout):
 * hidden fields are dropped whatever was sent, required ones must be
 * filled, and values are tidied. Throws a 400 naming the missing field.
 */
function applyCheckoutFields(store, input) {
  const f = storeSettings(store).checkout;
  const out = { ...input };
  const clean = (v) => (v == null ? "" : String(v).trim());
  const need = (key, label, mode) => {
    if (mode === "hidden") out[key] = null;
    else if (mode === "required" && !clean(out[key])) throw new HttpError(400, `Enter your ${label}.`);
    else out[key] = clean(out[key]) || null;
  };
  need("phone", "mobile number", f.phone);
  if (out.phone && !/^\+?[\d\s-]{7,20}$/.test(out.phone)) throw new HttpError(400, "Enter a valid mobile number.");
  need("shippingAddress2", "apartment or landmark", f.address2);
  need("company", "company name", f.company);
  need("note", "note", f.note);
  need("gstin", "GSTIN", f.gstin);
  if (out.gstin) {
    out.gstin = out.gstin.toUpperCase().replace(/\s+/g, "");
    if (!GSTIN.test(out.gstin)) throw new HttpError(400, "That GSTIN doesn't look right — it's 15 characters, like 27ABCDE1234F1Z5.");
  }
  if (f.marketing === "hidden") out.acceptsMarketing = false;
  if (f.country === "india") out.shippingCountry = "IN";
  return out;
}

/** Creates a real Order from the shopper's current cart — re-hydrated here
 * (never trusting client-submitted totals) so the price/discount/shipping/
 * tax actually charged is always what the store's current configuration
 * says it should be, not whatever the checkout form happened to render. */
async function placeOrder(prisma, storeId, cartId, handle, input, { store, shopper = null, verifiedPhone = null, log } = {}) {
  input = { ...input, email: String(input.email).trim().toLowerCase() };
  if (store) input = applyCheckoutFields(store, input);
  const raw = await cartService.readRaw(prisma, storeId, cartId);
  const cart = await cartService.hydrateCart(prisma, storeId, cartId, raw);
  if (cart.items.length === 0) throw new HttpError(400, "Your cart is empty");
  // Checking out again after an online payment that didn't finish (the
  // shopper came back from the gateway): that order is replaced, not kept
  // alongside the new one — its stock and gift card money go back first.
  if (raw.pendingOrderId && store) await replacePendingOrder(prisma, store, raw.pendingOrderId, log);
  if (cart.discount?.error) throw new HttpError(400, cart.discount.error);
  if (cart.gift_card?.error) throw new HttpError(400, `${cart.gift_card.error} Remove it from your cart to continue.`);
  // A gift card covering the whole order leaves nothing to collect.
  const giftCard = cart.gift_card && cart.gift_card.amount > 0 ? cart.gift_card : null;
  const due = cart.due;
  if (due <= 0) input = { ...input, paymentMethod: "gift_card" };
  else if (input.paymentMethod === "gift_card") {
    throw new HttpError(400, "Your gift card no longer covers the whole order. Choose how to pay the rest.");
  }
  let gateway = null;
  if (input.paymentMethod === "cod") {
    if (store && !payments.codEnabled(store)) throw new HttpError(400, "Cash on delivery isn't available for this store.");
  } else if (input.paymentMethod !== "gift_card") {
    gateway = await payments.gateway(prisma, storeId, input.paymentMethod);
    if (!gateway?.enabled) throw new HttpError(400, "That payment method isn't available for this store.");
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
    ...(input.phone && { phone: input.phone }),
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
  // A verified sign-in phone (Phone Login) is never replaced by the
  // delivery phone typed here — the order keeps its own copy.
  if (existingCustomer?.phoneVerifiedAt) delete customerFields.phone;
  // A mobile number confirmed with a code at checkout (One-Click popup),
  // typed on this order too: this shopper can be signed in — as the new
  // customer, one with no history yet, or the account that already owns
  // that verified number. Never into an account with a history of its own.
  const phoneMatches = verifiedPhone && input.phone && String(input.phone).replace(/\D/g, "").slice(-10) === String(verifiedPhone).slice(-10);
  const canSignIn =
    phoneMatches &&
    !signedIn &&
    (!existingCustomer ||
      (existingCustomer.phoneVerifiedAt && String(existingCustomer.phone || "").replace(/\D/g, "").slice(-10) === String(verifiedPhone).slice(-10)) ||
      (await shopperService.claimable(prisma, existingCustomer)));
  const customer = !existingCustomer
    ? await customersRepository.create(prisma, storeId, { email: input.email, ...customerFields })
    : (existingCustomer.passwordHash || existingCustomer.phoneVerifiedAt) && !signedIn && !canSignIn
      ? existingCustomer
      : await customersRepository.update(prisma, existingCustomer.id, customerFields);
  const signIn = canSignIn && store ? await shopperPhone.link(prisma, store, customer, verifiedPhone, input.shippingName) : null;

  const orderItems = cart.items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    title: item.title,
    quantity: item.quantity,
    price: item.price,
    total: Math.round((item.price * item.quantity + Number.EPSILON) * 100) / 100,
    // Rentals: the dates, how it travels, and the line shoppers and the
    // seller see under the item.
    ...(item.rental && { properties: { rental: item.rental, detail: item.detail } }),
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
    customerNote: input.note || null,
    buyerCompany: input.company || null,
    buyerGstin: input.gstin || null,
    paymentMethod: input.paymentMethod,
    sessionId: session?.id || null,
    giftCardAmount: giftCard?.amount || 0,
    giftCardId: giftCard?.id || null,
    placedSignedIn: signedIn || Boolean(signIn),
    ...(due <= 0 && { paymentStatus: "paid" }),
    // Oyklane's fee terms for this order, fixed now (billing/commission.js).
    ...(await feeSnapshot(prisma, storeId, { oneClick: Boolean(input.oneClick) })),
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
      // A rented piece comes back — stock stays; the booking holds it instead.
      if (!item.variantId || item.properties?.rental) continue;
      await adjustStock(tx, { storeId, variantId: item.variantId, delta: -item.quantity, reason: "sold", orderId: created.id });
    }
    // Rentals: one booking per rented line, its dates checked once more.
    await rentals.bookOrder(tx, storeId, created, created.items);
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

  // Online: start the payment with the seller's gateway. The order waits
  // as "pending" until the gateway confirms it (confirmPayment below).
  let razorpay = null;
  let payment = null;
  if (gateway) {
    const started = await gateway.provider.start({
      creds: gateway.creds,
      test: gateway.test,
      order,
      amount: due,
      store: store || (await prisma.store.findUnique({ where: { id: storeId } })),
      urls: returnUrls(input.returnBase, input.paymentMethod, order.id),
      mode: input.payMode,
    });
    const { ref, ...instruction } = started;
    payment = { provider: input.paymentMethod, ...instruction };
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentGatewayRef: ref, ...(input.paymentMethod === "razorpay" && { razorpayOrderId: ref }) },
    });
    // The cart stays until the payment is confirmed; remember which order
    // it's paying for, so a retry replaces it (see replacePendingOrder).
    await cartService.setPendingOrder(prisma, storeId, cartId, order.id);
    // Until it's paid it isn't an order (orders/placed.js): if the shopper
    // doesn't finish paying, this cart is what shows — under Abandoned
    // checkouts, with who they are, and gets the one reminder.
    if (store) await abandoned.captureContact(prisma, store, { cartId, email: input.email, name: input.shippingName }).catch(() => {});
    if (started.kind === "razorpay") razorpay = { orderId: started.orderId, amount: started.amount, currency: started.currency, keyId: started.keyId, method: started.method };
  }

  // Cash on delivery (or a gift card) is fully placed: the cart's job is
  // done. Online payments keep the cart until the payment is confirmed — a
  // shopper who cancels on the gateway (or closes Razorpay's window) comes
  // back to a full cart, and paying again replaces the unpaid order.
  if (!gateway) await cartService.clearCart(prisma, storeId, cartId);

  // Cash on delivery is final now; an online order is confirmed (and
  // emailed) once its payment is verified.
  if (input.paymentMethod === "gift_card") await syncOrderCommission(prisma, order.id);
  if (!gateway && store) {
    await notify.sendOrderPlaced(prisma, store, order, log).catch((err) => log?.error({ err }, "checkout: confirmation email failed"));
  }

  webhooks.emit(prisma, storeId, "order.created", { id: order.id });
  if (input.paymentMethod === "gift_card") webhooks.emit(prisma, storeId, "order.paid", { id: order.id });
  return { order, razorpay, payment, signIn };
}

/** Cancels the cart's earlier online order if it's still unpaid (it may
 * have been paid in the meantime — then it's a real order and stays). */
async function replacePendingOrder(prisma, store, orderId, log) {
  const old = await prisma.order.findFirst({ where: { id: orderId, storeId: store.id }, select: { id: true, paymentStatus: true, cancelledAt: true } });
  if (!old || old.paymentStatus !== "pending" || old.cancelledAt) return;
  await cancelOrder(prisma, store, old.id, { reason: REPLACED_REASON, restock: true, refund: false, notify: false }, { actorName: "Oyklane", log }).catch((err) =>
    log?.warn({ err, orderId }, "checkout: couldn't replace the unpaid order")
  );
}

/** Records a confirmed payment exactly once and does what a paid order
 * needs: timeline, platform fee, confirmation email. */
async function markOnlinePaid(prisma, order, { providerName, reference, log }) {
  const { count } = await prisma.order.updateMany({
    where: { id: order.id, paymentStatus: "pending" },
    data: { paymentStatus: "paid", paymentReference: reference, ...(order.paymentMethod === "razorpay" && { razorpayPaymentId: reference }) },
  });
  const paid = await prisma.order.findUnique({ where: { id: order.id }, include: { customer: true, items: true } });
  if (count === 1) {
    await addOrderEvent(prisma, order.id, {
      kind: "paid",
      message: paid.cancelledAt
        ? `Payment received online (${providerName} ${reference}) after the order was cancelled — refund it, or fulfil it as a new order`
        : `Payment received online (${providerName} ${reference})`,
    });
    await syncOrderCommission(prisma, order.id);
    webhooks.emit(prisma, paid.storeId, "order.paid", { id: order.id });
    const store = await prisma.store.findUnique({ where: { id: paid.storeId }, include: { plan: true } });
    await notify.sendOrderPlaced(prisma, store, paid, log).catch((err) => log?.error({ err }, "checkout: confirmation email failed"));
  }
  return paid;
}

/** The shopper is back from the gateway: ask the gateway (server to
 * server, with the seller's keys) whether the payment for this order's
 * gateway reference succeeded. Nothing the browser sends is trusted on its
 * own. */
async function confirmPayment(prisma, store, { orderId, provider, params, cartId }, { log } = {}) {
  const order = await prisma.order.findFirst({ where: { id: orderId, storeId: store.id } });
  if (!order || order.paymentMethod !== provider || !order.paymentGatewayRef) throw new HttpError(400, "Payment verification failed");
  if (order.paymentStatus === "paid") return { paid: true, order };
  const gateway = await payments.gateway(prisma, store.id, provider);
  if (!gateway) throw new HttpError(400, "This payment method is no longer connected.");
  const due = Math.max(0, Number(order.total) - Number(order.giftCardAmount || 0));
  const result = await gateway.provider.confirm({ creds: gateway.creds, test: gateway.test, ref: order.paymentGatewayRef, amount: due, order }, params || {});
  if (!result.paid) return { paid: false, order, message: result.message || "The payment wasn't completed." };
  const paid = await markOnlinePaid(prisma, order, { providerName: gateway.provider.name, reference: result.reference, log });
  if (cartId) await cartService.clearCart(prisma, store.id, cartId).catch(() => {});
  // A gateway that posts back from its own site (PayU) arrives without the
  // shopper's cookies, so also clear the cart that was paying for this order.
  await prisma.cartSession.deleteMany({ where: { storeId: store.id, data: { path: ["pendingOrderId"], equals: order.id } } }).catch(() => {});
  return { paid: true, order: paid };
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
/** The Razorpay modal's callback (storefront /checkout/razorpay/verify). */
async function verifyRazorpayPayment(prisma, { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature, cartId }, { log } = {}) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.paymentMethod !== "razorpay") throw new HttpError(400, "Payment verification failed");
  const store = await prisma.store.findUnique({ where: { id: order.storeId } });
  const result = await confirmPayment(prisma, store, { orderId, provider: "razorpay", params: { razorpay_order_id, razorpay_payment_id, razorpay_signature }, cartId }, { log });
  if (!result.paid) throw new HttpError(400, result.message || "Payment verification failed");
  return prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, items: true } });
}

module.exports = {
  getCheckoutContext,
  placeOrder,
  getOrderForConfirmation,
  verifyRazorpayPayment,
  confirmPayment,
  availablePaymentMethods,
};
