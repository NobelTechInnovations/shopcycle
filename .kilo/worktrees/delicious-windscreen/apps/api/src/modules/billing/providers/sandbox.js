const crypto = require("crypto");

/**
 * Local development without payment keys (BILLING_SANDBOX=true): mandates
 * are active at once and every charge succeeds immediately. Never used in
 * production (env.js refuses BILLING_SANDBOX there).
 */
const key = "sandbox";
const payments = new Map();
const rid = (p) => `${p}_sbx${crypto.randomBytes(6).toString("hex")}`;

const configured = () => true;
const livemode = () => false;

async function createCustomer() {
  return { id: rid("cust") };
}
async function createMandateOrder({ amount, method }) {
  return { orderId: rid("order"), amount: method === "emandate" ? 0 : amount };
}
async function createPaymentOrder({ amount }) {
  return { orderId: rid("order"), amount };
}
function checkoutOptions({ orderId, amount }) {
  return { provider: key, sandbox: true, order_id: orderId, amount: Math.round(amount * 100) };
}
/** The sandbox "checkout" reports success with signature "sandbox". */
function verifyCheckoutSignature({ signature }) {
  return signature === "sandbox";
}
async function fetchPayment(paymentId) {
  const p = payments.get(paymentId);
  if (p) return p;
  // A sandbox checkout payment: "pay_sbx…" with amount/token in its id.
  const m = /^pay_sbx_([0-9.]+)_(tok_[a-z0-9]+|none)_(\w+)$/.exec(paymentId);
  if (!m) return { id: paymentId, status: "failed", amount: 0, errorReason: "Unknown sandbox payment" };
  return { id: paymentId, orderId: null, status: "captured", amount: Number(m[1]), method: m[3], tokenId: m[2] === "none" ? null : m[2], display: { type: m[3], label: `Sandbox ${m[3].toUpperCase()}` } };
}
async function fetchMandate({ tokenId }) {
  return { id: tokenId, status: "active", method: "upi", display: { type: "upi", label: "Sandbox UPI" } };
}
async function charge({ amount }) {
  const id = rid("pay");
  payments.set(id, { id, status: "captured", amount, method: "upi" });
  return { orderId: rid("order"), paymentId: id, status: "captured" };
}
async function refund() {
  return { id: rid("rfnd"), status: "processed" };
}
async function cancelMandate() {
  return true;
}
const verifyWebhook = () => false;
const parseWebhook = () => null;

module.exports = { key, configured, livemode, createCustomer, createMandateOrder, createPaymentOrder, checkoutOptions, verifyCheckoutSignature, fetchPayment, fetchMandate, charge, refund, cancelMandate, verifyWebhook, parseWebhook };
