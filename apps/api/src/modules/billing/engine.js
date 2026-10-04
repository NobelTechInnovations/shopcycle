const { getSettings } = require("./settings");
const { addInterval, addDays, DAY } = require("./pricing");
const { num, tax } = require("./money");
const { provider } = require("./providers");
const { transition, logEvent, syncStorePlan, S } = require("./state");
const { notify } = require("./notifications");
const cycles = require("./cycles");
const charges = require("./charges");
const mandates = require("./mandates");
const commission = require("./commission");
const appCharges = require("./app-charges");
const subscriptions = require("./subscriptions");

/**
 * The billing engine. Everything that happens because time passed:
 *
 *   trial ends        → charge the ₹99 first month on the mandate, or —
 *                       with no mandate — PENDING_PAYMENT (dashboard locked)
 *   period ends       → apply a scheduled downgrade, charge the renewal
 *   yearly plans      → settle checkout fees every month
 *   cancelled         → at period end: EXPIRED, 7-day grace, mandate off
 *   payment failed    → retries inside the grace period
 *   grace over        → PAST_DUE (dashboard locked, storefront live)
 *   each unpaid month → one more failure; at 3 → SUSPENDED (store offline)
 *   reminders         → before billing, before the trial / grace ends
 *   reconciliation    → asks the provider about payments and mandates a
 *                       webhook never reported; replays failed webhooks
 *
 * Driven by dates stored on the subscription, so it's safe to run as
 * often as you like, from several processes: a subscription is claimed
 * before it's worked on, and every charge has an idempotency key.
 */
const CLAIM_TTL_MS = 10 * 60 * 1000;

function dueWhere(now, { storeId } = {}) {
  const monthAgo = addInterval(now, "month", -1);
  return {
    ...(storeId && { storeId }),
    AND: [
      { OR: [{ processingAt: null }, { processingAt: { lt: new Date(Date.now() - CLAIM_TTL_MS) } }] },
      {
        OR: [
          { status: S.TRIALING, trialEndsAt: { lte: now } },
          { status: S.ACTIVE, autoRenew: true, nextBillingAt: { lte: now } },
          { status: { in: [S.ACTIVE, S.CANCEL_SCHEDULED] }, interval: "year", feesSettledThrough: { lte: monthAgo } },
          { status: S.CANCEL_SCHEDULED, currentPeriodEnd: { lte: now } },
          { status: S.GRACE_PERIOD, OR: [{ graceEndsAt: { lte: now } }, { nextRetryAt: { lte: now } }, { dunningNextAt: { lte: now } }] },
          { status: { in: [S.PAST_DUE, S.PENDING_PAYMENT, S.EXPIRED] }, dunningNextAt: { lte: now } },
          { status: S.EXPIRED, lockedAt: null, graceEndsAt: { lte: now } },
        ],
      },
    ],
  };
}

async function claim(prisma, id) {
  const r = await prisma.subscription.updateMany({
    where: { id, OR: [{ processingAt: null }, { processingAt: { lt: new Date(Date.now() - CLAIM_TTL_MS) } }] },
    data: { processingAt: new Date() },
  });
  return r.count === 1;
}

const release = (prisma, id) => prisma.subscription.update({ where: { id }, data: { processingAt: null } }).catch(() => {});

async function load(prisma, id) {
  return prisma.subscription.findUnique({ where: { id }, include: { plan: true, store: true } });
}

/** One pass over every subscription with something due. */
async function runBilling(prisma, { now = new Date(), log, storeId = null, limit = 50 } = {}) {
  const settings = await getSettings(prisma, { fresh: true });
  const due = await prisma.subscription.findMany({ where: dueWhere(now, { storeId }), select: { id: true }, orderBy: { updatedAt: "asc" }, take: limit });
  const result = { processed: 0, errors: 0 };
  for (const { id } of due) {
    if (!(await claim(prisma, id))) continue;
    try {
      // A subscription can have several things due at once (a test clock
      // jumping a month); keep going until it settles, a few steps at most.
      for (let step = 0; step < 6; step += 1) {
        const sub = await load(prisma, id);
        if (!sub) break;
        const acted = await processOne(prisma, sub, { now, settings, log });
        if (!acted) break;
      }
      result.processed += 1;
    } catch (err) {
      result.errors += 1;
      log?.error({ err, subscriptionId: id }, "billing: engine failed on a subscription");
    } finally {
      await release(prisma, id);
    }
  }
  return result;
}

/** Does the next due thing for one subscription. Returns true if it
 * changed something (so the caller looks again). */
async function processOne(prisma, sub, { now, settings, log }) {
  const store = sub.store;
  const at = (d) => d && new Date(d) <= now;

  switch (sub.status) {
    case S.TRIALING:
      if (at(sub.trialEndsAt)) return endTrial(prisma, store, sub, { now, log });
      return false;

    case S.ACTIVE:
      if (sub.autoRenew && at(sub.nextBillingAt)) return renew(prisma, store, sub, { now, log });
      if (sub.interval === "year") return settleYearlyFees(prisma, store, sub, { now, settings, log });
      return false;

    case S.CANCEL_SCHEDULED:
      if (at(sub.currentPeriodEnd)) return expire(prisma, store, sub, { now, settings, log });
      if (sub.interval === "year") return settleYearlyFees(prisma, store, sub, { now, settings, log });
      return false;

    case S.GRACE_PERIOD:
      if (at(sub.dunningNextAt)) return countUnpaidCycle(prisma, store, sub, { now, settings, log });
      if (at(sub.graceEndsAt)) return lockDashboard(prisma, store, sub, S.PAST_DUE, { now, settings, log });
      if (at(sub.nextRetryAt)) return retry(prisma, store, sub, { now, log });
      return false;

    case S.EXPIRED:
      if (!sub.lockedAt && at(sub.graceEndsAt)) return lockDashboard(prisma, store, sub, S.EXPIRED, { now, settings, log });
      if (at(sub.dunningNextAt)) return countUnpaidCycle(prisma, store, sub, { now, settings, log });
      return false;

    case S.PAST_DUE:
    case S.PENDING_PAYMENT:
      if (at(sub.dunningNextAt)) return countUnpaidCycle(prisma, store, sub, { now, settings, log });
      return false;

    default:
      return false;
  }
}

/** The trial is over: charge the first month, or lock the dashboard. */
async function endTrial(prisma, store, sub, { now, log }) {
  const cycle = await cycles.firstCycle(prisma, store, sub, sub.plan, sub.trialEndsAt);
  if (cycle.status === "processing" || cycle.status === "paid") return false; // waiting on the bank
  const mandate = await charges.activeMandate(prisma, sub.id);
  // Nothing to collect (a free plan with no orders yet) needs no mandate.
  if (cycle.status === "due" && (mandate || num(cycle.total) < 1)) {
    await charges.chargeCycle(prisma, cycle.id, { now, log });
    return true;
  }

  // No way to collect: the dashboard locks until the seller subscribes;
  // the storefront stays live. This is the first unpaid cycle.
  const moved = await prisma.$transaction(async (tx) => {
    const fresh = await tx.subscription.findUnique({ where: { id: sub.id } });
    if (fresh.status !== S.TRIALING) return false;
    await transition(tx, fresh, S.PENDING_PAYMENT, {
      type: "trial.ended",
      data: { cycleId: cycle.id, reason: mandate ? "charge_failed" : "no_mandate" },
      patch: { consecutiveFailures: 1, lastFailureAt: now, lockedAt: now, dunningNextAt: addInterval(sub.trialEndsAt, "month") },
    });
    await tx.billingFailure.create({
      data: { storeId: store.id, subscriptionId: sub.id, cycleId: cycle.id, failureNumber: 1, reason: "The trial ended without a payment method." },
    });
    return true;
  });
  if (moved) {
    await notify(prisma, store, "trial_expired", { amount: num(cycle.total) }, { dedupeKey: `trial_expired:${sub.id}`, log });
  }
  return moved;
}

/** A renewal: a scheduled plan change takes effect, then the new period
 * is charged. */
async function renew(prisma, store, sub, { now, log }) {
  let current = sub;
  if (sub.pendingPlanId || sub.pendingInterval) {
    const planId = sub.pendingPlanId || sub.planId;
    current = await prisma.$transaction(async (tx) => {
      const updated = await transition(tx, sub, sub.status, {
        type: "plan.changed",
        data: { fromPlanId: sub.planId, toPlanId: planId, fromInterval: sub.interval, toInterval: sub.pendingInterval || sub.interval, scheduled: true },
        patch: { planId, interval: sub.pendingInterval || sub.interval, pendingPlanId: null, pendingInterval: null },
      });
      await syncStorePlan(tx, store.id, planId);
      return updated;
    });
  }
  const plan = await prisma.plan.findUnique({ where: { id: current.planId } });
  const start = current.currentPeriodEnd || current.nextBillingAt;
  const cycle = await cycles.regularCycle(prisma, store, current, plan, start);
  if (cycle.status !== "due") return false; // being charged, or already settled
  await charges.chargeCycle(prisma, cycle.id, { now, log });
  return true;
}

/** Yearly plans pay their checkout fees monthly rather than once a year. */
async function settleYearlyFees(prisma, store, sub, { now, settings, log }) {
  const from = sub.feesSettledThrough || sub.currentPeriodStart;
  if (!from) return false;
  const to = addInterval(from, "month");
  if (to > now) return false;
  const acc = await commission.accruedTotal(prisma, store.id);
  const apps = await appCharges.pendingTotal(prisma, store.id, to);
  const owed = Math.max(0, acc.amount) + apps;
  const total = tax(owed, settings.taxRate, store.billingState).total;
  const installedPaid = await prisma.storeApp.count({ where: { storeId: store.id, app: { priceMonthly: { gt: 0 } } } });
  if ((owed <= 0 || total < 1) && !installedPaid) {
    await prisma.subscription.update({ where: { id: sub.id }, data: { feesSettledThrough: to } });
    return true;
  }
  const cycle = await cycles.feesCycle(prisma, store, sub, from, to);
  if (cycle.status !== "due") return false;
  await charges.chargeCycle(prisma, cycle.id, { now, log });
  return true;
}

/** A cancelled subscription reaches its end. */
async function expire(prisma, store, sub, { now, settings, log }) {
  const live = await prisma.mandate.findMany({ where: { subscriptionId: sub.id, status: { in: ["active", "pending", "paused"] } } });
  for (const m of live) await mandates.cancel(prisma, m, { reason: "Subscription ended", log });

  if (!sub.startedAt) {
    // Cancelled during the trial and never paid: same as a trial that
    // ends without a payment method.
    const cycle = await cycles.firstCycle(prisma, store, sub, sub.plan, sub.trialEndsAt || now);
    await prisma.$transaction(async (tx) => {
      await transition(tx, sub, S.PENDING_PAYMENT, {
        type: "trial.ended",
        data: { cycleId: cycle.id, reason: "cancelled" },
        patch: { consecutiveFailures: 1, lastFailureAt: now, lockedAt: now, dunningNextAt: addInterval(now, "month"), expiredAt: now },
      });
      await tx.billingFailure.create({ data: { storeId: store.id, subscriptionId: sub.id, cycleId: cycle.id, failureNumber: 1, reason: "Cancelled during the trial." } });
    });
    await notify(prisma, store, "trial_expired", { amount: num(cycle.total) }, { dedupeKey: `trial_expired:${sub.id}`, log });
    return true;
  }

  const graceEndsAt = addDays(now, settings.graceDays);
  await prisma.$transaction(async (tx) => {
    await transition(tx, sub, S.EXPIRED, {
      type: "subscription.expired",
      data: { periodEnd: sub.currentPeriodEnd },
      patch: { expiredAt: now, cancelledAt: now, graceEndsAt, consecutiveFailures: 1, lastFailureAt: now, dunningNextAt: addInterval(now, "month"), nextBillingAt: null },
    });
    await tx.billingFailure.create({ data: { storeId: store.id, subscriptionId: sub.id, failureNumber: 1, reason: "Subscription ended after cancellation.", graceEndsAt } });
  });
  await notify(prisma, store, "subscription_expired", { graceDays: settings.graceDays, graceEndsAt }, { dedupeKey: `expired:${sub.id}:${new Date(sub.currentPeriodEnd).getTime()}`, log });
  return true;
}

/** What the seller owes now (for notices). */
async function owed(prisma, store, sub) {
  const open = await cycles.outstanding(prisma, sub.id);
  if (open) return num(open.total);
  const settings = await getSettings(prisma);
  const { regularPrice } = require("./pricing");
  return tax(regularPrice(sub, sub.plan, sub.interval, settings, new Date()), settings.taxRate, store.billingState).total;
}

/** Grace over: the dashboard locks; the storefront stays live. */
async function lockDashboard(prisma, store, sub, to, { now, settings, log }) {
  await prisma.$transaction((tx) => transition(tx, sub, to, { type: "dashboard.locked", patch: { lockedAt: now, nextRetryAt: null } }));
  await notify(
    prisma,
    store,
    "dashboard_locked",
    { amount: await owed(prisma, store, sub), maxFailures: settings.maxConsecutiveFailures },
    { dedupeKey: `locked:${sub.id}:${new Date(sub.lastFailureAt || now).getTime()}`, log }
  );
  return true;
}

/** Another month unpaid. At the limit the store goes offline. */
async function countUnpaidCycle(prisma, store, sub, { now, settings, log }) {
  const n = sub.consecutiveFailures + 1;
  const amount = await owed(prisma, store, sub);
  if (n >= settings.maxConsecutiveFailures) {
    await prisma.$transaction(async (tx) => {
      await transition(tx, sub, S.SUSPENDED, {
        type: "store.suspended",
        data: { failures: n },
        patch: { consecutiveFailures: n, lastFailureAt: now, suspendedAt: now, lockedAt: sub.lockedAt || now, dunningNextAt: null, nextRetryAt: null },
      });
      await tx.billingFailure.create({ data: { storeId: store.id, subscriptionId: sub.id, failureNumber: n, reason: `${n} billing cycles unpaid — store suspended.` } });
    });
    await notify(prisma, store, "store_suspended", { amount, maxFailures: settings.maxConsecutiveFailures }, { dedupeKey: `suspended:${sub.id}:${n}:${now.toISOString().slice(0, 10)}`, log });
    return true;
  }
  // Still unpaid a month on. Past the grace period the dashboard is locked.
  const to = sub.status === S.GRACE_PERIOD ? S.PAST_DUE : sub.status;
  await prisma.$transaction(async (tx) => {
    await transition(tx, sub, to, {
      type: "billing.cycle_unpaid",
      data: { failures: n },
      patch: { consecutiveFailures: n, lastFailureAt: now, dunningNextAt: addInterval(sub.dunningNextAt || now, "month"), lockedAt: sub.lockedAt || now, nextRetryAt: null },
    });
    await tx.billingFailure.create({ data: { storeId: store.id, subscriptionId: sub.id, failureNumber: n, reason: `${n} billing cycles unpaid.` } });
  });
  await notify(prisma, store, "dashboard_locked", { amount, maxFailures: settings.maxConsecutiveFailures }, { dedupeKey: `unpaid:${sub.id}:${n}`, log });
  // Try the mandate once more, if there is one.
  const open = await cycles.outstanding(prisma, sub.id);
  if (open && open.status === "failed" && (await charges.activeMandate(prisma, sub.id))) await charges.chargeCycle(prisma, open.id, { now, log });
  return true;
}

/** An automatic retry inside the grace period. */
async function retry(prisma, store, sub, { now, log }) {
  await prisma.subscription.update({ where: { id: sub.id }, data: { nextRetryAt: null } });
  const open = await cycles.outstanding(prisma, sub.id);
  if (!open || open.status !== "failed") return true;
  await notify(prisma, store, "payment_retry", { amount: num(open.total), attempt: open.attempts + 1 }, { dedupeKey: `retry:${open.id}:${open.attempts}`, log });
  await charges.chargeCycle(prisma, open.id, { now, log });
  return true;
}

// ── Reminders ────────────────────────────────────────────────────────

/** The reminder due now for a date `d` days away: the smallest configured
 * lead time that's still ≥ the days left (so a late run doesn't send
 * three at once). */
function leadFor(target, now, days) {
  const left = Math.ceil((new Date(target) - now) / DAY);
  if (left < 0) return null;
  const fit = [...days].map(Number).sort((a, b) => a - b).find((d) => d >= left);
  return fit ?? null;
}

async function sendReminders(prisma, { now = new Date(), log, storeId = null } = {}) {
  const settings = await getSettings(prisma);
  const maxOf = (arr) => Math.max(0, ...arr.map(Number));
  const horizon = (days) => new Date(now.getTime() + (maxOf(days) + 1) * DAY);
  const scope = storeId ? { storeId } : {};
  const subs = await prisma.subscription.findMany({
    where: {
      ...scope,
      OR: [
        { status: S.ACTIVE, autoRenew: true, nextBillingAt: { gt: now, lte: horizon(settings.reminderDaysBeforeBilling) } },
        { status: S.TRIALING, trialEndsAt: { gt: now, lte: horizon(settings.trialEndingReminderDays) } },
        { status: { in: [S.GRACE_PERIOD, S.EXPIRED] }, lockedAt: null, graceEndsAt: { gt: now, lte: horizon(settings.graceEndingReminderDays) } },
        { status: S.TRIALING, createdAt: { gt: new Date(now.getTime() - 2 * DAY) } },
      ],
    },
    include: { plan: true, store: true },
    take: 200,
  });
  let sent = 0;
  const once = async (key, fn) => {
    const exists = await prisma.billingNotification.findUnique({ where: { dedupeKey: key }, select: { id: true } });
    if (exists) return;
    if (await fn()) sent += 1;
  };
  for (const sub of subs) {
    const store = sub.store;
    if (sub.status === S.TRIALING) {
      await once(`trial_started:${sub.id}`, () => subscriptions.welcome(prisma, store, sub, { log }).then(() => true));
      const d = sub.trialEndsAt && leadFor(sub.trialEndsAt, now, settings.trialEndingReminderDays);
      if (d != null && new Date(sub.trialEndsAt) > now) {
        const mandate = await charges.activeMandate(prisma, sub.id);
        const next = await cycles.estimateNext(prisma, store, sub, sub.plan, { settings });
        await once(`trial_ending:${sub.id}:${d}`, () =>
          notify(prisma, store, "trial_ending", { planName: sub.plan.name, trialEndsAt: sub.trialEndsAt, mandateActive: Boolean(mandate), introTotal: next?.total || 0 }, { dedupeKey: `trial_ending:${sub.id}:${d}`, log })
        );
      }
    } else if (sub.status === S.ACTIVE) {
      const d = leadFor(sub.nextBillingAt, now, settings.reminderDaysBeforeBilling);
      if (d == null) continue;
      const next = await cycles.estimateNext(prisma, store, sub, sub.plan, { settings });
      if (!next) continue;
      const key = `billing_reminder:${sub.id}:${new Date(sub.nextBillingAt).getTime()}:${d}`;
      await once(key, () =>
        notify(prisma, store, "billing_reminder", { days: d, dueAt: sub.nextBillingAt, amount: next.total, fees: next.fees, planName: sub.plan.name }, { dedupeKey: key, log })
      );
    } else {
      const d = leadFor(sub.graceEndsAt, now, settings.graceEndingReminderDays);
      if (d == null) continue;
      const key = `grace_ending:${sub.id}:${new Date(sub.graceEndsAt).getTime()}:${d}`;
      await once(key, async () => notify(prisma, store, "grace_ending", { amount: await owed(prisma, store, sub), graceEndsAt: sub.graceEndsAt }, { dedupeKey: key, log }));
    }
  }
  return { sent };
}

// ── Reconciliation ───────────────────────────────────────────────────

/** Payments and mandates the provider hasn't told us about (a webhook
 * lost or delayed): ask it directly. */
async function reconcile(prisma, { now = new Date(), log } = {}) {
  const p = provider();
  const stale = new Date(Date.now() - 30 * 60 * 1000);
  const out = { payments: 0, mandates: 0, webhooks: 0 };

  const payments = await prisma.billingPayment.findMany({
    where: { status: "pending", provider: p.key, providerPaymentId: { not: null }, updatedAt: { lt: stale } },
    orderBy: { updatedAt: "asc" },
    take: 20,
  });
  for (const pay of payments) {
    try {
      const pp = await p.fetchPayment(pay.providerPaymentId);
      const r = await charges.applyProviderPayment(prisma, pay, pp, { now, log });
      if (r === "pending") await prisma.billingPayment.update({ where: { id: pay.id }, data: { raw: { ...(pay.raw || {}), checkedAt: new Date().toISOString() } } });
      else out.payments += 1;
    } catch (err) {
      log?.warn({ err, paymentId: pay.id }, "billing: reconcile payment failed");
    }
  }

  // A charge claimed but never recorded (the process died mid-call) —
  // after two hours with no webhook, count it as failed so dunning runs.
  const stuck = await prisma.billingCycle.findMany({
    where: { status: "processing", lastAttemptAt: { lt: new Date(Date.now() - 2 * 60 * 60 * 1000) }, payments: { none: { status: { in: ["pending", "captured"] } } } },
    take: 20,
  });
  for (const c of stuck) {
    await prisma.billingCycle.update({ where: { id: c.id }, data: { status: "due" } });
    await charges.failCycle(prisma, c.id, "The charge couldn't be confirmed.", { now, log, code: "unconfirmed" });
  }

  const pendingMandates = await prisma.mandate.findMany({
    where: { status: "pending", provider: p.key, providerTokenId: { not: null }, updatedAt: { lt: stale } },
    take: 20,
  });
  for (const m of pendingMandates) {
    try {
      await mandates.sync(prisma, m, { now, log });
      await prisma.mandate.update({ where: { id: m.id }, data: { updatedAt: new Date() } });
      out.mandates += 1;
    } catch (err) {
      log?.warn({ err, mandateId: m.id }, "billing: reconcile mandate failed");
    }
  }

  const { replayFailed } = require("./webhooks");
  out.webhooks = await replayFailed(prisma, { log });
  return out;
}

/** The job that runs on a timer (jobs.js). */
async function tick(prisma, { log } = {}) {
  const now = new Date();
  const billed = await runBilling(prisma, { now, log });
  const reminders = await sendReminders(prisma, { now, log });
  const reconciled = await reconcile(prisma, { now, log });
  return { ...billed, reminders: reminders.sent, ...reconciled };
}

module.exports = { runBilling, processOne, sendReminders, reconcile, tick, leadFor, dueWhere };
