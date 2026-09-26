const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");

/**
 * Thin client for the Razorpay REST API (platform billing only — shopper
 * checkout has its own calls in checkout/service.js). The base URL comes
 * from RAZORPAY_API_URL so the billing flows can be exercised end to end
 * against a local mock (apps/api/test/razorpay-mock.js) without real keys.
 */
function razorpayConfigured() {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

/** How merchants pay Oyklane on this deployment:
 *   "razorpay"      — real (or test-mode) Razorpay keys are set
 *   "sandbox"       — local dev, no keys, BILLING_SANDBOX=true: plans start
 *                     without a mandate and nothing is ever charged
 *   "unconfigured"  — no keys: merchants can't pick a plan yet */
function billingMode() {
  if (razorpayConfigured()) return "razorpay";
  return env.BILLING_SANDBOX ? "sandbox" : "unconfigured";
}

function authHeader() {
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  return { authorization: `Basic ${auth}` };
}

async function razorpayRequest(path, { method = "GET", body } = {}) {
  const res = await fetch(`${env.RAZORPAY_API_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...authHeader() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new HttpError(502, data?.error?.description || `Razorpay request failed: ${res.status}`);
  }
  return data;
}

/** Moves a subscription to another Razorpay plan. `when` is "now" (used
 * during the free trial, before anything's been charged) or "cycle_end"
 * (the new price starts at the next renewal). */
function updateSubscriptionPlan(subscriptionId, razorpayPlanId, when) {
  return razorpayRequest(`/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    body: { plan_id: razorpayPlanId, schedule_change_at: when, customer_notify: 1 },
  });
}

function fetchSubscription(subscriptionId) {
  return razorpayRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

/** Drops a plan change scheduled with "cycle_end" — the subscription
 * renews on its current plan instead. */
function cancelScheduledChanges(subscriptionId) {
  return razorpayRequest(`/subscriptions/${subscriptionId}/cancel_scheduled_changes`, { method: "POST" });
}

/** A one-off charge added to the subscription's NEXT invoice — how
 * platform fees (commission) are collected without charging merchants
 * separately. `amount` is in rupees; Razorpay wants paise. */
function createAddon(subscriptionId, { name, description, amount }) {
  return razorpayRequest(`/subscriptions/${subscriptionId}/addons`, {
    method: "POST",
    body: {
      item: { name, description, amount: Math.round(Number(amount) * 100), currency: "INR" },
      quantity: 1,
    },
  });
}

module.exports = {
  razorpayConfigured,
  billingMode,
  razorpayRequest,
  fetchSubscription,
  updateSubscriptionPlan,
  cancelScheduledChanges,
  createAddon,
};
