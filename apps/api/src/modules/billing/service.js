const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { GRACE_DAYS_BEFORE_PLAN_REQUIRED, computeAccessState } = require("./access");

function razorpayConfigured() {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

function authHeader() {
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  return { authorization: `Basic ${auth}` };
}

async function razorpayRequest(path, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
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

/** Every plan needs a matching Razorpay Plan before a merchant can
 * subscribe to it — created once, lazily, on whichever store subscribes
 * first, then reused by every store after (see Plan.razorpayPlanId). Never
 * pre-created in the seed script: creating it against a live Razorpay
 * account is a side effect that shouldn't happen just from running `seed`
 * in a dev environment with no real keys configured. */
async function ensureRazorpayPlan(prisma, plan) {
  if (plan.razorpayPlanId) return plan.razorpayPlanId;

  const created = await razorpayRequest("/plans", {
    method: "POST",
    body: {
      period: "monthly",
      interval: 1,
      item: {
        name: `${plan.name} plan`,
        amount: Math.round(Number(plan.priceMonthly) * 100),
        currency: "INR",
      },
      notes: { planId: plan.id },
    },
  });

  await prisma.plan.update({ where: { id: plan.id }, data: { razorpayPlanId: created.id } });
  return created.id;
}

/** Starts (or restarts) a store's subscription mandate. The subscription
 * is authorized right away — that's the whole point of a mandate — but
 * billing doesn't actually start until `start_at`, one month out, which is
 * what makes this "authorize now, first real charge in a month" rather
 * than an immediate charge. Razorpay requires a finite `total_count`; 120
 * monthly cycles (10 years) is used as a practical stand-in for "ongoing,"
 * renewable the same way if it's ever actually reached. */
async function createSubscription(prisma, store, plan) {
  if (!razorpayConfigured()) {
    throw new HttpError(400, "Payments aren't configured on this platform yet.");
  }

  const razorpayPlanId = await ensureRazorpayPlan(prisma, plan);
  const startAt = Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000);

  const subscription = await razorpayRequest("/subscriptions", {
    method: "POST",
    body: {
      plan_id: razorpayPlanId,
      total_count: 120,
      quantity: 1,
      customer_notify: 1,
      start_at: startAt,
      notes: { storeId: store.id, planId: plan.id },
    },
  });

  return { subscriptionId: subscription.id, razorpayKeyId: env.RAZORPAY_KEY_ID, trialEndsAt: new Date(startAt * 1000) };
}

/** Verifies the checkout widget's callback signature the same way
 * checkout/service.js would for a one-off order — HMAC-SHA256 over
 * `payment_id|subscription_id` using the account's key secret. Never
 * trust a client-reported "it worked" without this; it's the only proof
 * the callback actually came from Razorpay and wasn't fabricated. */
function verifySubscriptionSignature({ razorpay_payment_id, razorpay_subscription_id, razorpay_signature }) {
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
    .digest("hex");
  return expected === razorpay_signature;
}

/** Called once the checkout widget's handler confirms the mandate was
 * authorized — moves the store from no_plan straight to trialing (the
 * free month), whatever plan it previously had (a re-subscribe after a
 * cancellation lands the same way). */
async function activateSubscription(prisma, store, plan, { subscriptionId, trialEndsAt }) {
  return prisma.store.update({
    where: { id: store.id },
    data: {
      planId: plan.id,
      subscriptionStatus: "trialing",
      razorpaySubscriptionId: subscriptionId,
      trialEndsAt,
      mandateDeadline: null,
      paymentFailedAt: null,
    },
  });
}

/** Handles the four webhook events that actually change a store's
 * billing state — everything else (subscription.pending, invoice.*, ...)
 * is ignored on purpose rather than mapped to a state that doesn't exist
 * here yet. See access.js for what past_due actually does to admin/
 * storefront access over the following days. */
async function handleWebhookEvent(prisma, event) {
  const subscriptionId =
    event.payload?.subscription?.entity?.id || event.payload?.payment?.entity?.subscription_id;
  if (!subscriptionId) return;

  const store = await prisma.store.findUnique({ where: { razorpaySubscriptionId: subscriptionId } });
  if (!store) return; // not one of ours, or already unlinked — nothing to do

  if (event.event === "subscription.charged") {
    await prisma.store.update({
      where: { id: store.id },
      data: { subscriptionStatus: "active", paymentFailedAt: null },
    });
  } else if (event.event === "payment.failed" || event.event === "subscription.halted") {
    await prisma.store.update({
      where: { id: store.id },
      data: { subscriptionStatus: "past_due", paymentFailedAt: store.paymentFailedAt || new Date() },
    });
  } else if (event.event === "subscription.cancelled") {
    await prisma.store.update({
      where: { id: store.id },
      data: { subscriptionStatus: "cancelled" },
    });
  }
}

function verifyWebhookSignature(rawBody, signature) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = crypto.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  return expected === signature;
}

function serializeBillingStatus(store) {
  return {
    subscriptionStatus: store.subscriptionStatus,
    accessState: computeAccessState(store),
    mandateDeadline: store.mandateDeadline,
    trialEndsAt: store.trialEndsAt,
    paymentFailedAt: store.paymentFailedAt,
    graceDays: GRACE_DAYS_BEFORE_PLAN_REQUIRED,
  };
}

module.exports = {
  razorpayConfigured,
  createSubscription,
  verifySubscriptionSignature,
  activateSubscription,
  handleWebhookEvent,
  verifyWebhookSignature,
  serializeBillingStatus,
};
