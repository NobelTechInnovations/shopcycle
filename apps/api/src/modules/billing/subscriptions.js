const { HttpError } = require("@shopcycle/utils");
const { getSettings } = require("./settings");
const { addDays } = require("./pricing");
const { tax, num } = require("./money");
const { transition, logEvent, syncStorePlan, S } = require("./state");
const { notify } = require("./notifications");

/**
 * One subscription per store. Billing belongs to the store, not the
 * account: every new store — even a second one by the same owner — starts
 * its own free trial and its own ₹99 first month.
 */

/** The plan a new trial starts on. */
async function trialPlan(db) {
  const settings = await getSettings(db);
  return (
    (await db.plan.findFirst({ where: { key: settings.defaultTrialPlan, isActive: true } })) ||
    (await db.plan.findFirst({ where: { key: { not: null }, isActive: true }, orderBy: { sortOrder: "asc" } }))
  );
}

/** Starts the store's trial. Safe inside a transaction (`db` = tx) and
 * safe to call twice. Returns null if the plan catalog isn't set up yet. */
async function createForStore(db, store, { now = new Date(), trialEndsAt = null, planId = null } = {}) {
  const existing = await db.subscription.findUnique({ where: { storeId: store.id } });
  if (existing) return existing;
  const settings = await getSettings(db);
  const plan = planId ? await db.plan.findUnique({ where: { id: planId } }) : await trialPlan(db);
  if (!plan) return null;
  const ends = trialEndsAt || addDays(now, settings.trialDays);
  try {
    const sub = await db.subscription.create({
      data: { storeId: store.id, planId: plan.id, interval: "month", status: S.TRIALING, trialStartedAt: now, trialEndsAt: ends },
    });
    await logEvent(db, sub, "trial.started", { data: { planId: plan.id, trialEndsAt: ends } });
    await syncStorePlan(db, store.id, plan.id);
    return sub;
  } catch (err) {
    if (err.code === "P2002") return db.subscription.findUnique({ where: { storeId: store.id } });
    throw err;
  }
}

/** The store's subscription, created on the spot for a store that
 * somehow has none (every store must be billable). */
async function forStore(prisma, store) {
  const sub = await prisma.subscription.findUnique({ where: { storeId: store.id }, include: { plan: true } });
  if (sub) return sub;
  await createForStore(prisma, store);
  return prisma.subscription.findUnique({ where: { storeId: store.id }, include: { plan: true } });
}

/** The welcome notice for a new trial (once per store). */
async function welcome(prisma, store, sub, { log } = {}) {
  if (sub.status !== S.TRIALING) return;
  const exists = await prisma.billingNotification.findUnique({ where: { dedupeKey: `trial_started:${sub.id}` }, select: { id: true } });
  if (exists) return;
  const settings = await getSettings(prisma);
  await notify(
    prisma,
    store,
    "trial_started",
    {
      trialDays: settings.trialDays,
      planName: sub.plan?.name || "Oyklane",
      trialEndsAt: sub.trialEndsAt,
      introTotal: tax(settings.introPrice, settings.taxRate, store.billingState).total,
    },
    { dedupeKey: `trial_started:${sub.id}`, log }
  );
}

/** Seller cancels: nothing is refunded and the paid period (or the trial)
 * runs to its end; then the subscription expires. */
async function cancel(prisma, store, sub, { reason, actorType = "seller", actorId = null, log, now = new Date() } = {}) {
  if (![S.ACTIVE, S.TRIALING].includes(sub.status)) {
    if (sub.status === S.CANCEL_SCHEDULED) throw new HttpError(409, "Your subscription is already set to end.");
    throw new HttpError(409, "Settle your outstanding payment before cancelling.");
  }
  const periodEnd = sub.status === S.TRIALING ? sub.trialEndsAt : sub.currentPeriodEnd;
  const updated = await prisma.$transaction((tx) =>
    transition(tx, sub, S.CANCEL_SCHEDULED, {
      type: "subscription.cancel_requested",
      actorType,
      actorId,
      data: { reason: reason || null, periodEnd },
      patch: {
        autoRenew: false,
        cancelRequestedAt: now,
        cancelReason: reason ? String(reason).slice(0, 500) : null,
        currentPeriodEnd: periodEnd,
        pendingPlanId: null,
        pendingInterval: null,
      },
    })
  );
  await notify(prisma, store, "subscription_cancelled", { planName: sub.plan?.name || "Your plan", periodEnd }, { dedupeKey: `cancelled:${sub.id}:${now.getTime()}`, log });
  return updated;
}

/** Undo a cancellation before the period ends. */
async function resume(prisma, store, sub, { actorType = "seller", actorId = null, now = new Date() } = {}) {
  if (sub.status !== S.CANCEL_SCHEDULED) throw new HttpError(409, "Your subscription isn't set to end.");
  if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) <= now) throw new HttpError(409, "This period has already ended — choose a plan to start again.");
  const inTrial = !sub.startedAt && sub.trialEndsAt && new Date(sub.trialEndsAt) > now;
  return prisma.$transaction((tx) =>
    transition(tx, sub, inTrial ? S.TRIALING : S.ACTIVE, {
      type: "subscription.resumed",
      actorType,
      actorId,
      patch: { autoRenew: true, cancelRequestedAt: null, cancelReason: null, ...(inTrial && { currentPeriodEnd: null }) },
    })
  );
}

function serialize(sub, { settings } = {}) {
  if (!sub) return null;
  return {
    id: sub.id,
    status: sub.status,
    planId: sub.planId,
    interval: sub.interval,
    autoRenew: sub.autoRenew,
    trialStartedAt: sub.trialStartedAt,
    trialEndsAt: sub.trialEndsAt,
    introUsed: Boolean(sub.introUsedAt),
    introAvailable: Boolean(settings?.introEnabled) && !sub.introUsedAt,
    startedAt: sub.startedAt,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    nextBillingAt: sub.nextBillingAt,
    pendingPlanId: sub.pendingPlanId,
    pendingInterval: sub.pendingInterval,
    cancelRequestedAt: sub.cancelRequestedAt,
    cancelReason: sub.cancelReason,
    cancelledAt: sub.cancelledAt,
    expiredAt: sub.expiredAt,
    graceEndsAt: sub.graceEndsAt,
    lockedAt: sub.lockedAt,
    suspendedAt: sub.suspendedAt,
    consecutiveFailures: sub.consecutiveFailures,
    lastFailureAt: sub.lastFailureAt,
    nextRetryAt: sub.nextRetryAt,
    dunningNextAt: sub.dunningNextAt,
    accessGrantedUntil: sub.accessGrantedUntil,
    promo: sub.promoPrice != null ? { price: num(sub.promoPrice), cyclesLeft: sub.promoCyclesLeft, note: sub.promoNote } : null,
    providerCustomerId: sub.providerCustomerId,
    createdAt: sub.createdAt,
  };
}

module.exports = { trialPlan, createForStore, forStore, welcome, cancel, resume, serialize };
