const { HttpError } = require("@shopcycle/utils");
const { syncOrderCommission } = require("../billing/commission");
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
  return {
    return: `${root}/checkout/return/${provider}?order=${encodeURIComponent(orderId)}`,
    cancel: `${root}/checkout?checkoutError=${encodeURIComponent("Payment was cancelled — your order is saved; try paying again or choose another method.")}`,
  };
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
    });
    const { ref, ...instruction } = started;
    payment = { provider: input.paymentMethod, ...instruction };
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentGatewayRef: ref, ...(input.paymentMethod === "razorpay" && { razorpayOrderId: ref }) },
    });
    if (started.kind === "razorpay") razorpay = { orderId: started.orderId, amount: started.amount, currency: started.currency, keyId: started.keyId };
  }

  // The cart's job ends here either way — COD is fully placed, and a
  // Razorpay order already exists server-side even if the shopper abandons
  // the payment modal next (their order sits pending, same as any real
  // gateway checkout that gets interrupted after the order is created).
  // Redirect gateways keep the cart until the payment is confirmed (a
  // shopper who cancels on the gateway's page returns to a full cart).
  if (!gateway || payment?.kind === "razorpay") await cartService.clearCart(prisma, storeId, cartId);

  // Cash on delivery is final now; an online order is confirmed (and
  // emailed) once its payment is verified.
  if (input.paymentMethod === "gift_card") await syncOrderCommission(prisma, order.id);
  if (!gateway && store) {
    await notify.sendOrderPlaced(prisma, store, order, log).catch((err) => log?.error({ err }, "checkout: confirmation email failed"));
  }

  webhooks.emit(prisma, storeId, "order.created", { id: order.id });
  if (input.paymentMethod === "gift_card") webhooks.emit(prisma, storeId, "order.paid", { id: order.id });
  return { order, razorpay, payment };
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
    await addOrderEvent(prisma, order.id, { kind: "paid", message: `Payment received online (${providerName} ${reference})` });
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
async function verifyRazorpayPayment(prisma, { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }, { log } = {}) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.paymentMethod !== "razorpay") throw new HttpError(400, "Payment verification failed");
  const store = await prisma.store.findUnique({ where: { id: order.storeId } });
  const result = await confirmPayment(prisma, store, { orderId, provider: "razorpay", params: { razorpay_order_id, razorpay_payment_id, razorpay_signature } }, { log });
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
