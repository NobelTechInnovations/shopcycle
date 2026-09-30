const { HttpError } = require("@shopcycle/utils");
const { getSettings } = require("./settings");
const { periodPrice, dailyRate, proration, isFreePlan } = require("./pricing");
const { tax, num, round2 } = require("./money");
const { transition, syncStorePlan, S } = require("./state");
const entitlements = require("./entitlements");
const cycles = require("./cycles");
const charges = require("./charges");

/**
 * Changing plan or billing interval. One policy everywhere:
 *
 *   Free window (trial, the ₹99 first month, an admin free plan, or before
 *   paying again after the subscription lapsed) → switches at once,
 *   nothing charged now.
 *   Upgrade (a higher price per day, or monthly → yearly) → at once, with
 *   a prorated charge: the new plan for the rest of the period minus
 *   credit for the unused part of what was paid. Monthly → yearly starts
 *   a new yearly period today.
 *   Downgrade (a lower price per day, or yearly → monthly) → at the end
 *   of the paid period; nothing is refunded. Can be undone until then.
 *
 * With a payment outstanding, the seller settles it first.
 */
async function loadPlan(prisma, planId) {
  const plan = planId ? await prisma.plan.findUnique({ where: { id: String(planId) }, include: { features: true } }) : null;
  if (!plan || !plan.isActive || !plan.key) throw new HttpError(400, "Choose one of the available plans.");
  return plan;
}

const INTERVALS = ["month", "year"];

/** Is the subscription in its ₹99 first month? */
async function inIntroMonth(prisma, sub, now) {
  if (sub.status !== S.ACTIVE || !sub.introUsedAt || !sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) <= now) return false;
  const last = await prisma.billingCycle.findFirst({
    where: { subscriptionId: sub.id, status: "paid", kind: { in: ["intro", "regular", "reactivation"] } },
    orderBy: { paidAt: "desc" },
    select: { kind: true },
  });
  return last?.kind === "intro";
}

/** Staff on the store must fit the target plan (grants included). */
async function assertFits(prisma, store, plan) {
  const [used, grants] = await Promise.all([entitlements.staffUsage(prisma, store.id), entitlements.activeGrants(prisma, store.id)]);
  const limit = entitlements.compute(plan, grants).limits.staff;
  if (limit != null && used > limit) {
    throw new HttpError(400, `${plan.name} includes ${limit} staff account${limit === 1 ? "" : "s"} — you have ${used}. Remove team members (or pending invites) before switching.`);
  }
}

/** What a change would do, without doing it. */
async function preview(prisma, store, sub, { planId, interval, now = new Date() }) {
  const settings = await getSettings(prisma);
  const toPlan = await loadPlan(prisma, planId || sub.planId);
  const toInterval = INTERVALS.includes(interval) ? interval : sub.interval;
  const fromPlan = sub.plan || (await prisma.plan.findUnique({ where: { id: sub.planId } }));
  const base = { planId: toPlan.id, planName: toPlan.name, interval: toInterval, price: periodPrice(toPlan, toInterval, settings) };

  if (toPlan.id === sub.planId && toInterval === sub.interval) {
    return { ...base, type: "same", appliesAt: sub.pendingPlanId || sub.pendingInterval ? "cancel_pending" : "none", charge: null };
  }

  const trialRunning = sub.status === S.TRIALING && sub.trialEndsAt && new Date(sub.trialEndsAt) > now;
  const lapsed = [S.PENDING_PAYMENT, S.EXPIRED, S.CANCELLED].includes(sub.status);
  const suspendedClear = sub.status === S.SUSPENDED && !(await cycles.outstanding(prisma, sub.id));
  // An admin free plan: switching costs nothing either (the order
  // commission follows the new plan's rate from now on).
  const freePlan = isFreePlan(sub, now) && ![S.GRACE_PERIOD, S.PAST_DUE].includes(sub.status);
  if (trialRunning || lapsed || suspendedClear || freePlan || (await inIntroMonth(prisma, sub, now))) {
    return { ...base, type: "free", appliesAt: "now", effectiveDate: now, charge: null };
  }
  if ([S.GRACE_PERIOD, S.PAST_DUE, S.SUSPENDED].includes(sub.status)) {
    throw new HttpError(409, "Pay your outstanding amount first — then you can change plans.");
  }
  if (sub.status === S.CANCEL_SCHEDULED) throw new HttpError(409, "Resume your subscription to change plans.");
  if (sub.status !== S.ACTIVE) throw new HttpError(409, "Your subscription can't be changed right now.");

  const upgrade =
    (sub.interval === "month" && toInterval === "year") ||
    (sub.interval === toInterval && dailyRate(toPlan, toInterval, settings) > dailyRate(fromPlan, sub.interval, settings));

  if (!upgrade) {
    return { ...base, type: "downgrade", appliesAt: "period_end", effectiveDate: sub.currentPeriodEnd, charge: null };
  }

  // What was actually paid for this period — the renewal (maybe at a
  // promo price) plus any earlier upgrade in it, net of its credit.
  const paidCycles = await prisma.billingCycle.findMany({
    where: { subscriptionId: sub.id, status: "paid", kind: { in: ["regular", "reactivation", "proration"] }, periodEnd: sub.currentPeriodEnd },
    select: { planAmount: true, creditAmount: true },
  });
  const paidAmount = paidCycles.length ? round2(paidCycles.reduce((s, c) => s + num(c.planAmount) - num(c.creditAmount), 0)) : null;
  const pr = proration({
    fromPlan,
    fromInterval: sub.interval,
    toPlan,
    toInterval,
    periodStart: sub.currentPeriodStart,
    periodEnd: sub.currentPeriodEnd,
    now,
    settings,
    paidAmount,
  });
  const t = tax(pr.charge, settings.taxRate, store.billingState);
  return {
    ...base,
    type: "upgrade",
    appliesAt: "now",
    effectiveDate: now,
    newPeriod: pr.newPeriod,
    charge: { planAmount: round2(pr.charge + pr.credit), credit: pr.credit, subtotal: t.taxable, taxRate: t.rate, tax: t.amount, total: t.total, share: round2(pr.share) },
  };
}

/** Applies a change; returns the preview it acted on. */
async function change(prisma, store, sub, { planId, interval, now = new Date(), actorType = "seller", actorId = null, log }) {
  const p = await preview(prisma, store, sub, { planId, interval, now });
  const toPlan = await loadPlan(prisma, p.planId);

  if (p.type === "same") {
    if (p.appliesAt !== "cancel_pending") throw new HttpError(400, `You're already on ${toPlan.name} (${p.interval === "year" ? "yearly" : "monthly"}).`);
    await prisma.$transaction((tx) =>
      transition(tx, sub, sub.status, { type: "plan.change_cancelled", actorType, actorId, patch: { pendingPlanId: null, pendingInterval: null } })
    );
    return { ...p, appliesAt: "cancelled" };
  }

  if (p.type === "downgrade") {
    await assertFits(prisma, store, toPlan);
    await prisma.$transaction((tx) =>
      transition(tx, sub, sub.status, {
        type: "plan.change_scheduled",
        actorType,
        actorId,
        data: { toPlanId: toPlan.id, toInterval: p.interval, at: sub.currentPeriodEnd },
        patch: { pendingPlanId: toPlan.id, pendingInterval: p.interval },
      })
    );
    return p;
  }

  if (p.type === "free") {
    await assertFits(prisma, store, toPlan);
    await prisma.$transaction(async (tx) => {
      await transition(tx, sub, sub.status, {
        type: "plan.changed",
        actorType,
        actorId,
        data: { fromPlanId: sub.planId, toPlanId: toPlan.id, fromInterval: sub.interval, toInterval: p.interval, free: true },
        patch: { planId: toPlan.id, interval: p.interval, pendingPlanId: null, pendingInterval: null },
      });
      await syncStorePlan(tx, store.id, toPlan.id);
    });
    // An unpaid charge priced for the old plan is replaced at checkout.
    const open = await cycles.outstanding(prisma, sub.id);
    if (open && open.status !== "processing") {
      if (open.kind === "intro") await prisma.billingCycle.update({ where: { id: open.id }, data: { planId: toPlan.id } });
      else if (["regular", "reactivation"].includes(open.kind)) await cycles.voidCycle(prisma, open.id, "Plan changed before payment");
    }
    return p;
  }

  // Upgrade: switch now and collect the difference on the mandate.
  if (p.charge.total >= 1 && !(await charges.activeMandate(prisma, sub.id))) {
    throw new HttpError(400, "Set up autopay first — the upgrade is charged to your saved payment method.");
  }
  const cycle =
    p.charge.total >= 1
      ? await cycles.prorationCycle(prisma, store, sub, {
          toPlan,
          toInterval: p.interval,
          charge: p.charge.subtotal,
          credit: p.charge.credit,
          periodStart: sub.currentPeriodStart,
          periodEnd: p.newPeriod ? p.newPeriod.end : sub.currentPeriodEnd,
          now,
        })
      : null;
  await prisma.$transaction(async (tx) => {
    await transition(tx, sub, sub.status, {
      type: "plan.upgraded",
      actorType,
      actorId,
      data: { fromPlanId: sub.planId, toPlanId: toPlan.id, fromInterval: sub.interval, toInterval: p.interval, cycleId: cycle?.id || null, charge: p.charge },
      patch: {
        planId: toPlan.id,
        interval: p.interval,
        pendingPlanId: null,
        pendingInterval: null,
        ...(p.newPeriod && { currentPeriodStart: p.newPeriod.start, currentPeriodEnd: p.newPeriod.end, nextBillingAt: p.newPeriod.end, feesSettledThrough: p.newPeriod.start }),
      },
    });
    await syncStorePlan(tx, store.id, toPlan.id);
  });
  if (cycle) await charges.chargeCycle(prisma, cycle.id, { now, log });
  return { ...p, cycleId: cycle?.id || null };
}

module.exports = { preview, change, loadPlan, assertFits, inIntroMonth };
