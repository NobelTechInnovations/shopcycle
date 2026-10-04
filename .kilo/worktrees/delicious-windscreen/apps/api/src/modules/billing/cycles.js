const { round2, num, tax } = require("./money");
const { getSettings } = require("./settings");
const { regularPrice, isFreePlan, addInterval } = require("./pricing");
const commission = require("./commission");
const appCharges = require("./app-charges");

/**
 * A billing cycle is one amount the engine collects: the ₹99 first month,
 * a renewal, an upgrade's proration, a yearly plan's monthly checkout-fee
 * settlement, or a reactivation. Each carries its own tax and an
 * idempotency key, so the engine can run any number of times and still
 * create — and charge — each cycle once.
 */
const OPEN = ["due", "processing", "failed"];

async function createCycle(prisma, { store, sub, kind, planId, interval, periodStart, periodEnd, dueAt, planAmount, credit = 0, includeFees = false, appsBoundary = null, key, meta = {} }) {
  const existing = await prisma.billingCycle.findUnique({ where: { idempotencyKey: key } });
  if (existing) return existing;
  const settings = await getSettings(prisma);
  try {
    return await prisma.$transaction(async (tx) => {
      const draft = await tx.billingCycle.create({
        data: {
          storeId: store.id,
          subscriptionId: sub.id,
          kind,
          planId: planId || sub.planId,
          interval: interval || sub.interval,
          periodStart,
          periodEnd,
          dueAt: dueAt || periodStart,
          planAmount: round2(planAmount),
          creditAmount: round2(credit),
          subtotal: 0,
          taxRate: settings.taxRate,
          taxAmount: 0,
          total: 0,
          idempotencyKey: key,
          meta,
        },
      });
      const fees = includeFees ? (await commission.collect(tx, store.id, draft.id)).amount : 0;
      const apps = appsBoundary ? (await appCharges.collect(tx, store, sub, draft.id, appsBoundary)).amount : 0;
      const subtotal = round2(Math.max(0, num(planAmount) - num(credit) + fees + apps));
      const t = tax(subtotal, settings.taxRate, store.billingState);
      return tx.billingCycle.update({ where: { id: draft.id }, data: { feesAmount: fees, appsAmount: apps, subtotal, taxAmount: t.amount, total: t.total } });
    });
  } catch (err) {
    if (err.code === "P2002") return prisma.billingCycle.findUnique({ where: { idempotencyKey: key } });
    throw err;
  }
}

/** The first paid month after the trial (₹99), or a regular period when
 * the intro offer is off or was already used by this store. */
async function firstCycle(prisma, store, sub, plan, start) {
  const settings = await getSettings(prisma);
  // On an admin free plan the first period is free too — and the ₹99 offer
  // stays unused for when the free plan ends.
  if (settings.introEnabled && !sub.introUsedAt && !isFreePlan(sub, start)) {
    return createCycle(prisma, {
      store,
      sub,
      kind: "intro",
      planId: plan.id,
      interval: "month",
      periodStart: start,
      periodEnd: addInterval(start, "month"),
      planAmount: settings.introPrice,
      includeFees: true,
      appsBoundary: start,
      key: `intro:${sub.id}`,
      meta: { introPrice: settings.introPrice },
    });
  }
  return regularCycle(prisma, store, sub, plan, start);
}

/** A renewal: the next period at the plan's price (or an admin promo). */
async function regularCycle(prisma, store, sub, plan, start, { interval } = {}) {
  const settings = await getSettings(prisma);
  const iv = interval || sub.interval;
  const free = isFreePlan(sub, start);
  const promo = !free && sub.promoPrice != null && (sub.promoCyclesLeft == null || sub.promoCyclesLeft > 0);
  return createCycle(prisma, {
    store,
    sub,
    kind: "regular",
    planId: plan.id,
    interval: iv,
    periodStart: start,
    periodEnd: addInterval(start, iv),
    planAmount: regularPrice(sub, plan, iv, settings, start),
    includeFees: true,
    appsBoundary: start,
    key: `regular:${sub.id}:${new Date(start).toISOString()}`,
    meta: free ? { freePlan: true, freePlanUntil: sub.freePlanUntil, note: sub.freePlanNote || null } : promo ? { promo: true, promoNote: sub.promoNote || null } : {},
  });
}

/**
 * Coming back after the subscription ended (expired, cancelled, or the
 * store was suspended with nothing outstanding): a fresh period that
 * starts when the payment lands. An unpaid reactivation for a different
 * plan is replaced, never stacked.
 */
async function reactivationCycle(prisma, store, sub, plan, interval, now = new Date()) {
  const open = await prisma.billingCycle.findMany({ where: { subscriptionId: sub.id, kind: "reactivation", status: "due" } });
  for (const c of open) {
    if (c.planId === plan.id && c.interval === interval) return c;
    await voidCycle(prisma, c.id, "Replaced by a new plan choice");
  }
  const settings = await getSettings(prisma);
  return createCycle(prisma, {
    store,
    sub,
    kind: "reactivation",
    planId: plan.id,
    interval,
    periodStart: now,
    periodEnd: addInterval(now, interval),
    planAmount: regularPrice(sub, plan, interval, settings, now),
    includeFees: true,
    appsBoundary: now,
    key: `reactivation:${sub.id}:${now.getTime()}`,
  });
}

/** Checkout fees (and paid apps) for a yearly plan, settled every month. */
async function feesCycle(prisma, store, sub, from, to) {
  return createCycle(prisma, {
    store,
    sub,
    kind: "fees",
    periodStart: from,
    periodEnd: to,
    planAmount: 0,
    includeFees: true,
    appsBoundary: to,
    key: `fees:${sub.id}:${new Date(from).toISOString()}`,
  });
}

/** An upgrade's prorated difference (no fees — those wait for renewal). */
async function prorationCycle(prisma, store, sub, { toPlan, toInterval, charge, credit, periodStart, periodEnd, now }) {
  return createCycle(prisma, {
    store,
    sub,
    kind: "proration",
    planId: toPlan.id,
    interval: toInterval,
    periodStart: now,
    periodEnd,
    dueAt: now,
    planAmount: round2(charge + credit),
    credit,
    key: `proration:${sub.id}:${now.getTime()}`,
    meta: { fromPlanId: sub.planId, fromInterval: sub.interval, periodStart },
  });
}

async function voidCycle(prisma, cycleId, reason) {
  await prisma.$transaction(async (tx) => {
    const r = await tx.billingCycle.updateMany({ where: { id: cycleId, status: { in: ["due", "failed"] } }, data: { status: "void", failureReason: reason } });
    if (r.count) {
      await commission.settle(tx, cycleId, "released");
      await appCharges.release(tx, await tx.billingCycle.findUnique({ where: { id: cycleId } }));
    }
  });
}

/** The oldest unpaid cycle — what the seller owes right now, if anything. */
function outstanding(prisma, subscriptionId) {
  return prisma.billingCycle.findFirst({ where: { subscriptionId, status: { in: OPEN } }, orderBy: { dueAt: "asc" } });
}

/** A preview of the next automatic charge, for the billing screen. */
async function estimateNext(prisma, store, sub, plan, { settings } = {}) {
  const s = settings || (await getSettings(prisma));
  const fees = await commission.accruedTotal(prisma, store.id);
  let date = null;
  let planAmount = 0;
  let kind = "regular";
  if (sub.status === "TRIALING") {
    date = sub.trialEndsAt;
    kind = s.introEnabled && !sub.introUsedAt && !isFreePlan(sub, date) ? "intro" : "regular";
    planAmount = kind === "intro" ? Number(s.introPrice) : regularPrice(sub, plan, sub.interval, s, date);
  } else if (["ACTIVE"].includes(sub.status) && sub.autoRenew) {
    date = sub.nextBillingAt;
    const nextPlan = sub.pendingPlanId ? await prisma.plan.findUnique({ where: { id: sub.pendingPlanId } }) : plan;
    planAmount = regularPrice(sub, nextPlan || plan, sub.pendingInterval || sub.interval, s, date);
  } else {
    return null;
  }
  const feeAmount = Math.max(0, fees.amount);
  const apps = await appCharges.pendingTotal(prisma, store.id, date);
  const subtotal = round2(planAmount + feeAmount + apps);
  const t = tax(subtotal, s.taxRate, store.billingState);
  return { date, kind, freePlan: isFreePlan(sub, date), planAmount: round2(planAmount), fees: feeAmount, feeOrders: fees.count, apps, subtotal, taxRate: Number(s.taxRate), tax: t.amount, total: t.total };
}

function serializeCycle(c) {
  if (!c) return null;
  return {
    id: c.id,
    kind: c.kind,
    planId: c.planId,
    interval: c.interval,
    periodStart: c.periodStart,
    periodEnd: c.periodEnd,
    dueAt: c.dueAt,
    planAmount: num(c.planAmount),
    feesAmount: num(c.feesAmount),
    appsAmount: num(c.appsAmount),
    creditAmount: num(c.creditAmount),
    subtotal: num(c.subtotal),
    taxRate: num(c.taxRate),
    taxAmount: num(c.taxAmount),
    total: num(c.total),
    status: c.status,
    attempts: c.attempts,
    paidAt: c.paidAt,
    failedAt: c.failedAt,
    failureReason: c.failureReason,
    invoiceId: c.invoiceId,
  };
}

module.exports = { createCycle, firstCycle, regularCycle, reactivationCycle, feesCycle, prorationCycle, voidCycle, outstanding, estimateNext, serializeCycle, OPEN };
