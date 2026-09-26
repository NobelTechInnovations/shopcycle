const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { GRACE_DAYS_BEFORE_PLAN_REQUIRED, computeAccessState } = require("./access");
const { safeEqual } = require("../../lib/crypto");
const { razorpayConfigured, billingMode, razorpayRequest, fetchSubscription } = require("./razorpay");
const { scheduleAccruedFees } = require("./commission");
const { issueRenewalInvoice } = require("./invoices");

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
  const mode = billingMode();
  if (mode === "sandbox") {
    // No mandate to authorize — the free trial starts right here.
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const updated = await activateSubscription(prisma, store, plan, { subscriptionId: null, trialEndsAt });
    return { sandbox: true, store: updated, trialEndsAt };
  }
  if (mode === "unconfigured") {
    throw new HttpError(503, "Plan billing isn't switched on for Oyklane yet. Please try again later.");
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
  return safeEqual(expected, razorpay_signature);
}

/** Which plan a verified mandate is actually for — read from Razorpay's
 * own record of the subscription, never from the browser. The signature
 * only proves the payment/subscription pair is genuine; without this a
 * merchant could authorize a ₹999 Starter mandate and then report Premium
 * as the plan, getting Premium while being charged for Starter. Also
 * refuses a subscription created for a different store. */
async function resolveMandatePlan(prisma, store, subscriptionId) {
  const subscription = await fetchSubscription(subscriptionId);
  if (subscription?.notes?.storeId !== store.id) {
    throw new HttpError(400, "This subscription doesn't belong to your store.");
  }
  const plan = await prisma.plan.findUnique({ where: { id: String(subscription.notes.planId || "") } });
  if (!plan || (plan.razorpayPlanId && subscription.plan_id && plan.razorpayPlanId !== subscription.plan_id)) {
    throw new HttpError(400, "Couldn't match this subscription to a plan.");
  }
  return plan;
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

const fromUnix = (s) => (s ? new Date(Number(s) * 1000) : null);

/** A successful renewal charge — the heart of platform billing:
 *   1. a downgrade scheduled for this renewal takes effect (Razorpay has
 *      already switched the plan at cycle end, so the store follows)
 *   2. the store is active again, with its new billing period recorded
 *   3. the GST invoice for this charge is issued (idempotent per payment),
 *      itemising the platform fees that were scheduled onto it
 *   4. fees accrued since the last renewal are scheduled onto the next one
 * Step 4 failing (Razorpay unreachable) must not fail the webhook — the
 * fees simply stay accrued and are picked up at the next renewal. */
async function handleCharged(prisma, store, event, log) {
  const subscription = event.payload?.subscription?.entity || {};
  const payment = event.payload?.payment?.entity || {};

  const updated = await prisma.store.update({
    where: { id: store.id },
    data: {
      subscriptionStatus: "active",
      paymentFailedAt: null,
      currentPeriodEnd: fromUnix(subscription.current_end) || store.currentPeriodEnd,
      ...(store.pendingPlanId && { planId: store.pendingPlanId, pendingPlanId: null }),
    },
    include: { plan: true },
  });

  if (payment.id && payment.amount) {
    await issueRenewalInvoice(prisma, updated, {
      paymentId: payment.id,
      total: Number(payment.amount) / 100,
      periodStart: fromUnix(subscription.current_start),
      periodEnd: fromUnix(subscription.current_end),
      planName: updated.plan?.name,
    });
  }

  try {
    await scheduleAccruedFees(prisma, updated);
  } catch (err) {
    log?.warn({ err, storeId: store.id }, "billing: could not schedule platform fees; they stay accrued");
  }
}

/** Handles the webhook events that change a store's billing state —
 * everything else (subscription.pending, invoice.*, ...) is acknowledged
 * and ignored. See access.js for what past_due does to admin/storefront
 * access over the following days. */
async function handleWebhookEvent(prisma, event, log) {
  const subscriptionId =
    event.payload?.subscription?.entity?.id || event.payload?.payment?.entity?.subscription_id;
  if (!subscriptionId) return;

  const store = await prisma.store.findUnique({ where: { razorpaySubscriptionId: subscriptionId } });
  if (!store) return; // not one of ours, or already unlinked — nothing to do

  if (event.event === "subscription.charged") {
    await handleCharged(prisma, store, event, log);
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
  return safeEqual(expected, signature);
}

function serializeBillingStatus(store) {
  const mode = billingMode();
  return {
    mode,
    // A pointer for whoever runs a dev/staging copy — never shown to
    // merchants on production, where it would only be noise.
    setupHint:
      mode === "unconfigured" && env.NODE_ENV !== "production"
        ? "Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env, or set BILLING_SANDBOX=true to test plans locally, then restart the API."
        : null,
    subscriptionStatus: store.subscriptionStatus,
    accessState: computeAccessState(store),
    mandateDeadline: store.mandateDeadline,
    trialEndsAt: store.trialEndsAt,
    paymentFailedAt: store.paymentFailedAt,
    currentPeriodEnd: store.currentPeriodEnd,
    pendingPlanId: store.pendingPlanId,
    graceDays: GRACE_DAYS_BEFORE_PLAN_REQUIRED,
    billingDetails: {
      billingName: store.billingName,
      gstin: store.gstin,
      billingAddress: store.billingAddress,
      billingState: store.billingState,
    },
  };
}

module.exports = {
  razorpayConfigured,
  billingMode,
  ensureRazorpayPlan,
  createSubscription,
  verifySubscriptionSignature,
  resolveMandatePlan,
  activateSubscription,
  handleWebhookEvent,
  verifyWebhookSignature,
  serializeBillingStatus,
};
