const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../../config/env");
const { safeEqual } = require("../../../lib/crypto");
const { toPaise, fromPaise } = require("../money");

/**
 * Razorpay as Oyklane's billing provider — recurring payments on a
 * mandate token (UPI AutoPay, card, or net-banking e-mandate):
 *
 *   customer  → POST /customers
 *   mandate   → POST /orders with `token` (+ Checkout with recurring: 1);
 *               the payment's token_id is the mandate
 *   charge    → POST /orders, then POST /payments/create/recurring
 *   outcome   → webhooks (payment.captured / payment.failed / token.*),
 *               and GET /payments/:id when a webhook is late
 *
 * The engine decides every amount (the ₹99 first month, renewals,
 * prorations, checkout-fee settlements); Razorpay only executes. Only
 * Razorpay's ids are stored — never card or bank details.
 */
const key = "razorpay";

function configured() {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

/** Live keys (rzp_live_…) vs test mode — mandates remember which. */
function livemode() {
  return /^rzp_live_/.test(String(env.RAZORPAY_KEY_ID || ""));
}

async function call(path, { method = "GET", body } = {}) {
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  let res;
  try {
    res = await fetch(`${env.RAZORPAY_API_URL}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new HttpError(502, "Couldn't reach Razorpay. Please try again in a moment.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new HttpError(res.status >= 500 ? 502 : 400, data?.error?.description || `Razorpay request failed (${res.status})`);
    err.providerCode = data?.error?.code;
    throw err;
  }
  return data;
}

async function createCustomer({ name, email, contact, notes }) {
  const c = await call("/customers", {
    method: "POST",
    body: { name: String(name || "Oyklane seller").slice(0, 50), email, ...(contact && { contact }), fail_existing: "0", notes: notes || {} },
  });
  return { id: c.id };
}

/** The authorisation order for a new mandate. `amount` is what's charged
 * right now with it (the amount due, or a ₹1 check that's refunded; 0 for
 * a net-banking e-mandate, which can't carry a charge). */
async function createMandateOrder({ customerId, method, amount, maxAmount, expireAt, receipt, notes }) {
  const token =
    method === "emandate"
      ? { auth_type: "netbanking", max_amount: toPaise(maxAmount), expire_at: Math.floor(expireAt.getTime() / 1000) }
      : { max_amount: toPaise(maxAmount), expire_at: Math.floor(expireAt.getTime() / 1000), frequency: "as_presented" };
  const order = await call("/orders", {
    method: "POST",
    body: {
      amount: method === "emandate" ? 0 : toPaise(amount),
      currency: "INR",
      customer_id: customerId,
      method,
      payment_capture: 1,
      receipt: String(receipt).slice(0, 40),
      notes: notes || {},
      token,
    },
  });
  return { orderId: order.id, amount: fromPaise(order.amount) };
}

/** A one-time payment (manual "pay now"), no mandate. */
async function createPaymentOrder({ amount, receipt, notes }) {
  const order = await call("/orders", {
    method: "POST",
    body: { amount: toPaise(amount), currency: "INR", payment_capture: 1, receipt: String(receipt).slice(0, 40), notes: notes || {} },
  });
  return { orderId: order.id, amount: fromPaise(order.amount) };
}

function checkoutOptions({ orderId, customerId, amount, recurring, name, description, prefill, notes }) {
  return {
    provider: key,
    key: env.RAZORPAY_KEY_ID,
    order_id: orderId,
    ...(customerId && { customer_id: customerId }),
    ...(recurring && { recurring: "1" }),
    amount: toPaise(amount),
    currency: "INR",
    name: name || "Oyklane",
    description: description || "Oyklane subscription",
    prefill: prefill || {},
    notes: notes || {},
  };
}

function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqual(expected, signature);
}

const PAYMENT_STATUS = { captured: "captured", failed: "failed", authorized: "pending", created: "pending", refunded: "refunded" };

function normalizePayment(p) {
  if (!p) return null;
  return {
    id: p.id,
    orderId: p.order_id || null,
    status: PAYMENT_STATUS[p.status] || "pending",
    amount: fromPaise(p.amount || 0),
    method: p.method || null,
    tokenId: p.token_id || null,
    customerId: p.customer_id || null,
    errorCode: p.error_code || null,
    errorReason: p.error_description || p.error_reason || null,
    display: displayOf(p),
    notes: p.notes || {},
  };
}

function maskVpa(vpa) {
  const [user, host] = String(vpa || "").split("@");
  if (!host) return null;
  return `${user.slice(0, 2)}***@${host}`;
}

function displayOf(src) {
  const method = src.method;
  if (method === "card" && src.card) {
    return { type: "card", brand: src.card.network || null, last4: src.card.last4 || null, label: `${src.card.network || "Card"} •••• ${src.card.last4 || ""}`.trim() };
  }
  if (method === "upi") {
    const vpa = maskVpa(src.vpa?.username ? `${src.vpa.username}@${src.vpa.handle}` : src.vpa);
    return { type: "upi", label: vpa ? `UPI · ${vpa}` : "UPI AutoPay" };
  }
  if (method === "emandate" || method === "nach") {
    const bank = src.bank || src.bank_details?.bank_name || null;
    return { type: "netbanking", bank, label: bank ? `e-Mandate · ${bank}` : "Bank e-Mandate" };
  }
  return { type: method || "unknown", label: method ? method.toUpperCase() : "Payment method" };
}

async function fetchPayment(paymentId) {
  return normalizePayment(await call(`/payments/${encodeURIComponent(paymentId)}`));
}

const TOKEN_STATUS = { confirmed: "active", initiated: "pending", rejected: "rejected", cancelled: "cancelled", paused: "paused" };

async function fetchMandate({ customerId, tokenId }) {
  const t = await call(`/customers/${encodeURIComponent(customerId)}/tokens/${encodeURIComponent(tokenId)}`);
  return {
    id: t.id,
    status: TOKEN_STATUS[t.recurring_details?.status] || (t.recurring ? "active" : "pending"),
    failureReason: t.recurring_details?.failure_reason || null,
    method: t.method,
    maxAmount: t.max_amount ? fromPaise(t.max_amount) : null,
    expiresAt: t.expired_at ? new Date(t.expired_at * 1000) : null,
    display: displayOf(t),
  };
}

/** An automatic charge on a mandate. The outcome arrives later (UPI
 * debits wait ~24 h for the bank's pre-debit notice) — usually "pending". */
async function charge({ customerId, tokenId, amount, receipt, description, notes, email, contact }) {
  const order = await call("/orders", {
    method: "POST",
    body: { amount: toPaise(amount), currency: "INR", payment_capture: 1, receipt: String(receipt).slice(0, 40), notes: notes || {} },
  });
  const pay = await call("/payments/create/recurring", {
    method: "POST",
    body: {
      email,
      ...(contact && { contact }),
      amount: toPaise(amount),
      currency: "INR",
      order_id: order.id,
      customer_id: customerId,
      token: tokenId,
      recurring: "1",
      description: String(description || "Oyklane subscription").slice(0, 255),
      notes: notes || {},
    },
  });
  return { orderId: order.id, paymentId: pay.razorpay_payment_id || pay.id || null, status: "pending" };
}

async function refund({ paymentId, amount, notes }) {
  const r = await call(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    body: { amount: toPaise(amount), notes: notes || {} },
  });
  return { id: r.id, status: r.status === "processed" ? "processed" : r.status === "failed" ? "failed" : "pending" };
}

async function cancelMandate({ customerId, tokenId }) {
  await call(`/customers/${encodeURIComponent(customerId)}/tokens/${encodeURIComponent(tokenId)}`, { method: "DELETE" });
  return true;
}

function verifyWebhook(rawBody, signature) {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature || !rawBody) return false;
  const expected = crypto.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  return safeEqual(expected, String(signature));
}

/** A webhook, reduced to what the engine needs. */
function parseWebhook(body, headers, rawBody) {
  const eventId = headers["x-razorpay-event-id"] || crypto.createHash("sha256").update(rawBody || JSON.stringify(body)).digest("hex");
  const type = String(body?.event || "unknown");
  const out = { eventId: String(eventId), type };
  const payment = body?.payload?.payment?.entity;
  if (payment) out.payment = normalizePayment(payment);
  const token = body?.payload?.token?.entity;
  if (token) {
    out.token = {
      id: token.id,
      customerId: token.customer_id || null,
      status: TOKEN_STATUS[token.recurring_details?.status] || (type === "token.confirmed" ? "active" : type === "token.rejected" ? "rejected" : type === "token.cancelled" ? "cancelled" : type === "token.paused" ? "paused" : "pending"),
      failureReason: token.recurring_details?.failure_reason || null,
      display: displayOf(token),
    };
  }
  const rf = body?.payload?.refund?.entity;
  if (rf) out.refund = { id: rf.id, paymentId: rf.payment_id, amount: fromPaise(rf.amount || 0), status: type === "refund.processed" ? "processed" : type === "refund.failed" ? "failed" : "pending" };
  return out;
}

module.exports = {
  key,
  configured,
  livemode,
  createCustomer,
  createMandateOrder,
  createPaymentOrder,
  checkoutOptions,
  verifyCheckoutSignature,
  fetchPayment,
  fetchMandate,
  charge,
  refund,
  cancelMandate,
  verifyWebhook,
  parseWebhook,
};
