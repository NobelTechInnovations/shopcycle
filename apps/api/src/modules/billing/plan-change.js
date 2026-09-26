const { HttpError } = require("@shopcycle/utils");
const { razorpayConfigured, updateSubscriptionPlan, cancelScheduledChanges } = require("./razorpay");

/**
 * Switching between plans for a store that already has a subscription.
 *
 *   During the free trial  → applies immediately, both directions; the
 *                            first charge will simply be at the new price.
 *   Upgrade (paid period)  → features apply immediately; the new price
 *                            starts at the next renewal.
 *   Downgrade (paid period)→ scheduled for the end of the period the store
 *                            has already paid for (Store.pendingPlanId),
 *                            and can be cancelled until then.
 *
 * Razorpay is told about every change so what it charges always matches
 * the plan the store is on; without Razorpay configured (local dev) only
 * the database changes.
 */

async function assertFitsPlan(prisma, store, plan) {
  const [productCount, staffCount] = await Promise.all([
    prisma.product.count({ where: { storeId: store.id } }),
    prisma.storeUser.count({ where: { storeId: store.id } }),
  ]);
  if (productCount > plan.productLimit) {
    throw new HttpError(
      400,
      `${plan.name} allows up to ${plan.productLimit} products — you have ${productCount}. Remove some before switching.`
    );
  }
  if (staffCount > plan.staffLimit) {
    throw new HttpError(
      400,
      `${plan.name} allows up to ${plan.staffLimit} staff accounts — you have ${staffCount}. Remove some team members before switching.`
    );
  }
}

async function changePlan(prisma, store, plan, { ensureRazorpayPlan }) {
  if (!["trialing", "active"].includes(store.subscriptionStatus)) {
    throw new HttpError(400, "Choose a plan and set up billing first.");
  }

  // Picking the current plan while a downgrade is pending = "never mind".
  if (plan.id === store.planId) {
    if (store.pendingPlanId) return cancelPendingChange(prisma, store);
    throw new HttpError(400, `You're already on ${plan.name}.`);
  }

  await assertFitsPlan(prisma, store, plan);

  const inTrial = store.subscriptionStatus === "trialing";
  const isUpgrade = Number(plan.priceMonthly) > Number(store.plan?.priceMonthly || 0);
  const now = inTrial || isUpgrade;

  if (store.razorpaySubscriptionId && razorpayConfigured()) {
    const razorpayPlanId = await ensureRazorpayPlan(prisma, plan);
    await updateSubscriptionPlan(store.razorpaySubscriptionId, razorpayPlanId, inTrial ? "now" : "cycle_end");
  }

  const updated = await prisma.store.update({
    where: { id: store.id },
    data: now ? { planId: plan.id, pendingPlanId: null } : { pendingPlanId: plan.id },
    include: { plan: true },
  });
  return {
    store: updated,
    appliesAt: now ? "now" : "period_end",
    effectiveDate: now ? new Date() : store.currentPeriodEnd || store.trialEndsAt,
  };
}

async function cancelPendingChange(prisma, store) {
  if (!store.pendingPlanId) throw new HttpError(400, "There's no scheduled plan change to cancel.");
  if (store.razorpaySubscriptionId && razorpayConfigured()) {
    await cancelScheduledChanges(store.razorpaySubscriptionId);
  }
  const updated = await prisma.store.update({
    where: { id: store.id },
    data: { pendingPlanId: null },
    include: { plan: true },
  });
  return { store: updated, appliesAt: "cancelled" };
}

/** Applies a scheduled downgrade once the paid period has ended. Run on
 * every renewal webhook and, as a fallback in case a webhook is missed,
 * lazily whenever the store is loaded. Returns the store (updated or not). */
async function applyDuePendingPlan(prisma, store) {
  if (!store.pendingPlanId) return store;
  const due = store.currentPeriodEnd && new Date(store.currentPeriodEnd).getTime() <= Date.now();
  if (!due) return store;
  return prisma.store.update({
    where: { id: store.id },
    data: { planId: store.pendingPlanId, pendingPlanId: null },
    include: { plan: true },
  });
}

module.exports = { changePlan, cancelPendingChange, applyDuePendingPlan };
