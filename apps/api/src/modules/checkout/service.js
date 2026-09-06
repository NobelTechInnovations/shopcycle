const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const cartService = require("../cart/service");
const discountService = require("../discounts/service");
const customersRepository = require("../customers/repository");
const ordersRepository = require("../orders/repository");

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

async function getCheckoutContext(prisma, redis, storeId, cartId, handle) {
  const cart = await cartService.getCart(prisma, redis, storeId, cartId, handle);
  return { cart, paymentMethods: availablePaymentMethods() };
}

async function createRazorpayOrder(amountInRupees, receipt) {
  const amountPaise = Math.round(amountInRupees * 100);
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
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
async function placeOrder(prisma, redis, storeId, cartId, handle, input) {
  const raw = await cartService.readRaw(redis, storeId, cartId);
  const cart = await cartService.hydrateCart(prisma, redis, storeId, cartId, raw);
  if (cart.items.length === 0) throw new HttpError(400, "Your cart is empty");
  if (cart.discount?.error) throw new HttpError(400, cart.discount.error);
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
  };
  const existingCustomer = await customersRepository.findByEmail(prisma, storeId, input.email);
  const customer = existingCustomer
    ? await customersRepository.update(prisma, existingCustomer.id, customerFields)
    : await customersRepository.create(prisma, storeId, { email: input.email, ...customerFields });

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
  };

  const orderNumber = await ordersRepository.nextOrderNumber(prisma, storeId);

  // Decrement inventory and create the order in one transaction — an order
  // that exists without the stock move (or vice versa) is worse than a
  // checkout that fails outright and lets the shopper retry.
  const order = await prisma.$transaction(async (tx) => {
    for (const item of orderItems) {
      if (!item.variantId) continue;
      // Not erroring on insufficient stock: there's no reservation/lock
      // step before checkout in this model, so — same tradeoff most small
      // storefronts make — let the sale through and leave a backorder for
      // the merchant to handle rather than losing it at the last step.
      await tx.productVariant.updateMany({
        where: { id: item.variantId },
        data: { inventoryQuantity: { decrement: item.quantity } },
      });
    }
    return tx.order.create({
      data: { ...orderData, storeId, orderNumber, items: { create: orderItems } },
      include: { customer: true, items: true },
    });
  });

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
    const rp = await createRazorpayOrder(cart.total, order.id);
    razorpay = { orderId: rp.id, amount: rp.amount, currency: rp.currency, keyId: env.RAZORPAY_KEY_ID };
    await prisma.order.update({ where: { id: order.id }, data: { razorpayOrderId: rp.id } });
  }

  // The cart's job ends here either way — COD is fully placed, and a
  // Razorpay order already exists server-side even if the shopper abandons
  // the payment modal next (their order sits pending, same as any real
  // gateway checkout that gets interrupted after the order is created).
  await cartService.clearCart(redis, storeId, cartId);

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
async function verifyRazorpayPayment(prisma, { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (!razorpayConfigured()) throw new HttpError(400, "Online payment isn't configured");
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  if (expected !== razorpay_signature) throw new HttpError(400, "Payment verification failed");

  return prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus: "paid", razorpayPaymentId: razorpay_payment_id },
    include: { customer: true, items: true },
  });
}

module.exports = {
  getCheckoutContext,
  placeOrder,
  getOrderForConfirmation,
  verifyRazorpayPayment,
  availablePaymentMethods,
};
