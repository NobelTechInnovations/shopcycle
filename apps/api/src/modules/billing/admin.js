const { HttpError } = require("@shopcycle/utils");
const { getSettings, saveSettings } = require("./settings");
const { periodPrice, addInterval, addDays, DAY } = require("./pricing");
const { num, round2, tax } = require("./money");
const { transition, logEvent, syncStorePlan, S, UNPAID } = require("./state");
const { notify } = require("./notifications");
const { computeAccess } = require("./access");
const cycles = require("./cycles");
const charges = require("./charges");
const mandates = require("./mandates");
const commission = require("./commission");
const entitlements = require("./entitlements");
const subscriptions = require("./subscriptions");
const { serializePayment } = require("./service");

/**
 * The platform console's billing controls. Every action is written to the
 * subscription's event log with the admin as the actor (and to the
 * platform audit log by the super-admin routes).
 */

// ── Reporting ────────────────────────────────────────────────────────

async function overview(prisma) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 330 * 60 * 1000);
  const since30 = new Date(now.getTime() - 30 * DAY);
  const settings = await getSettings(prisma);

  const [byStatus, paying, captured30, capturedMonth, capturedAll, gst30, gstMonth, failed30, mandateGroups, refunds, feeGroups, renewals, atRisk, limitRequests, webhookBacklog] = await Promise.all([
    prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.subscription.findMany({ where: { status: { in: [S.ACTIVE, S.CANCEL_SCHEDULED, S.GRACE_PERIOD] } }, select: { interval: true, promoPrice: true, promoCyclesLeft: true, plan: { select: { priceMonthly: true } } } }),
    prisma.billingPayment.aggregate({ where: { status: { in: ["captured", "partially_refunded", "refunded"] }, capturedAt: { gte: since30 } }, _sum: { amount: true, refundedAmount: true }, _count: { _all: true } }),
    prisma.billingPayment.aggregate({ where: { status: { in: ["captured", "partially_refunded", "refunded"] }, capturedAt: { gte: monthStart } }, _sum: { amount: true, refundedAmount: true } }),
    prisma.billingPayment.aggregate({ where: { status: { in: ["captured", "partially_refunded", "refunded"] } }, _sum: { amount: true, refundedAmount: true } }),
    prisma.taxTransaction.aggregate({ where: { createdAt: { gte: since30 } }, _sum: { taxableAmount: true, taxAmount: true, cgst: true, sgst: true, igst: true } }),
    prisma.taxTransaction.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { taxableAmount: true, taxAmount: true, cgst: true, sgst: true, igst: true } }),
    prisma.billingPayment.count({ where: { status: "failed", purpose: "charge", createdAt: { gte: since30 } } }),
    prisma.mandate.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.billingRefund.aggregate({ where: { status: { not: "failed" } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.commissionTransaction.groupBy({ by: ["status"], where: { status: { not: "void" } }, _sum: { baseFee: true } }),
    prisma.subscription.findMany({
      where: { status: S.ACTIVE, autoRenew: true, nextBillingAt: { gte: now, lte: new Date(now.getTime() + 7 * DAY) } },
      include: { store: { select: { id: true, name: true, handle: true } }, plan: { select: { name: true } } },
      orderBy: { nextBillingAt: "asc" },
      take: 10,
    }),
    prisma.subscription.findMany({
      where: { status: { in: [S.PENDING_PAYMENT, S.GRACE_PERIOD, S.PAST_DUE, S.SUSPENDED] } },
      include: { store: { select: { id: true, name: true, handle: true } }, plan: { select: { name: true } } },
      orderBy: { lastFailureAt: "desc" },
      take: 12,
    }),
    prisma.limitRequest.count({ where: { status: "pending" } }),
    prisma.paymentWebhookEvent.count({ where: { processed: false } }),
  ]);

  // MRR: what the paying subscriptions bring in per month, before tax.
  let mrr = 0;
  for (const s of paying) {
    const price = s.promoPrice != null && (s.promoCyclesLeft == null || s.promoCyclesLeft > 0) ? num(s.promoPrice) : periodPrice(s.plan, s.interval, settings);
    mrr += s.interval === "year" ? price / 12 : price;
  }
  mrr = round2(mrr);
  const net = (a) => round2(num(a._sum.amount) - num(a._sum.refundedAmount));
  const statusCount = Object.fromEntries(Object.values(S).map((k) => [k, byStatus.find((g) => g.status === k)?._count._all || 0]));
  const fee = (st) => round2(num(feeGroups.find((g) => g.status === st)?._sum.baseFee));
  const gst = (a) => ({ taxable: round2(num(a._sum.taxableAmount)), tax: round2(num(a._sum.taxAmount)), cgst: round2(num(a._sum.cgst)), sgst: round2(num(a._sum.sgst)), igst: round2(num(a._sum.igst)) });
  const row = (s) => ({ storeId: s.store.id, storeName: s.store.name, handle: s.store.handle, status: s.status, plan: s.plan.name, interval: s.interval, nextBillingAt: s.nextBillingAt, graceEndsAt: s.graceEndsAt, consecutiveFailures: s.consecutiveFailures, lastFailureAt: s.lastFailureAt });

  return {
    mrr,
    arr: round2(mrr * 12),
    statuses: statusCount,
    total: Object.values(statusCount).reduce((a, b) => a + b, 0),
    revenue: { last30: net(captured30), thisMonth: net(capturedMonth), allTime: net(capturedAll), payments30: captured30._count._all },
    gst: { last30: gst(gst30), thisMonth: gst(gstMonth), rate: Number(settings.taxRate) },
    failedPayments30: failed30,
    mandates: Object.fromEntries(mandateGroups.map((g) => [g.status, g._count._all])),
    refunds: { amount: round2(num(refunds._sum.amount)), count: refunds._count._all },
    fees: { accrued: fee("accrued"), billed: fee("billed"), paid: fee("paid") },
    upcomingRenewals: renewals.map(row),
    atRisk: atRisk.map(row),
    pendingLimitRequests: limitRequests,
    webhookBacklog,
  };
}

async function listSubscriptions(prisma, { status, q, page = 1, pageSize = 25 } = {}) {
  const where = {
    ...(status && { status }),
    ...(q && { store: { OR: [{ name: { contains: q, mode: "insensitive" } }, { handle: { contains: q, mode: "insensitive" } }] } }),
  };
  const [rows, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      include: {
        store: { select: { id: true, name: true, handle: true, status: true, storeUsers: { where: { role: "owner" }, take: 1, include: { user: { select: { email: true, name: true } } } } } },
        plan: { select: { id: true, name: true, key: true } },
        mandates: { where: { status: { in: ["active", "pending", "paused"] } }, take: 1, include: { paymentMethod: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.subscription.count({ where }),
  ]);
  return {
    subscriptions: rows.map((s) => ({
      storeId: s.store.id,
      storeName: s.store.name,
      handle: s.store.handle,
      storeStatus: s.store.status,
      owner: s.store.storeUsers[0]?.user || null,
      status: s.status,
      plan: s.plan,
      interval: s.interval,
      trialEndsAt: s.trialEndsAt,
      currentPeriodEnd: s.currentPeriodEnd,
      nextBillingAt: s.nextBillingAt,
      graceEndsAt: s.graceEndsAt,
      consecutiveFailures: s.consecutiveFailures,
      accessGrantedUntil: s.accessGrantedUntil,
      promo: s.promoPrice != null ? { price: num(s.promoPrice), cyclesLeft: s.promoCyclesLeft } : null,
      mandate: s.mandates[0] ? { status: s.mandates[0].status, method: s.mandates[0].method, label: s.mandates[0].paymentMethod?.label || s.mandates[0].method } : null,
      access: computeAccess(s, { storeStatus: s.store.status }),
      createdAt: s.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}

async function detail(prisma, storeId) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { storeUsers: { where: { role: "owner" }, include: { user: { select: { id: true, name: true, email: true } } } } },
  });
  if (!store) throw new HttpError(404, "Store not found");
  const sub = await subscriptions.forStore(prisma, store);
  if (!sub) throw new HttpError(404, "This store has no subscription yet.");
  const settings = await getSettings(prisma);
  const [mandateRows, cycleRows, payments, refunds, failures, events, notices, invoices, grants, requests, fees, ent, staff] = await Promise.all([
    prisma.mandate.findMany({ where: { subscriptionId: sub.id }, orderBy: { createdAt: "desc" }, take: 10, include: { paymentMethod: true } }),
    prisma.billingCycle.findMany({ where: { subscriptionId: sub.id }, orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.billingPayment.findMany({ where: { subscriptionId: sub.id }, orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.billingRefund.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.billingFailure.findMany({ where: { subscriptionId: sub.id }, orderBy: { occurredAt: "desc" }, take: 20 }),
    prisma.subscriptionEvent.findMany({ where: { subscriptionId: sub.id }, orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.billingNotification.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.platformInvoice.findMany({ where: { storeId }, orderBy: { issuedAt: "desc" }, take: 20 }),
    prisma.entitlementGrant.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.limitRequest.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 10 }),
    commission.feeSummary(prisma, storeId),
    entitlements.forStore(prisma, storeId, { planId: sub.planId }),
    entitlements.staffUsage(prisma, storeId),
  ]);
  const usable = await charges.activeMandate(prisma, sub.id);
  return {
    store: { id: store.id, name: store.name, handle: store.handle, status: store.status, createdAt: store.createdAt, billingName: store.billingName, gstin: store.gstin, billingState: store.billingState, owners: store.storeUsers.map((u) => u.user) },
    subscription: { ...subscriptions.serialize(sub, { settings }), plan: { id: sub.plan.id, key: sub.plan.key, name: sub.plan.name, priceMonthly: num(sub.plan.priceMonthly), commissionPercent: num(sub.plan.commissionPercent) } },
    access: computeAccess(sub, { storeStatus: store.status, mandateActive: Boolean(usable) }),
    next: await cycles.estimateNext(prisma, store, sub, sub.plan, { settings }),
    mandates: mandateRows.map(mandates.serialize),
    cycles: cycleRows.map(cycles.serializeCycle),
    payments: payments.map(serializePayment),
    refunds: refunds.map((r) => ({ id: r.id, paymentId: r.paymentId, amount: num(r.amount), status: r.status, reason: r.reason, providerRefundId: r.providerRefundId, createdAt: r.createdAt })),
    failures,
    events,
    notifications: notices,
    invoices: invoices.map((i) => ({ id: i.id, number: i.number, kind: i.kind, total: num(i.total), taxAmount: num(i.taxAmount), issuedAt: i.issuedAt })),
    grants,
    limitRequests: requests,
    fees,
    entitlements: ent,
    staff: { used: staff, limit: ent.limits.staff },
  };
}

// ── Actions ──────────────────────────────────────────────────────────

async function loadSub(prisma, storeId) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new HttpError(404, "Store not found");
  const sub = await subscriptions.forStore(prisma, store);
  if (!sub) throw new HttpError(404, "This store has no subscription.");
  return { store, sub };
}

const admin = (actorId) => ({ actorType: "admin", actorId });

/** Takes the store offline for billing (as if 3 cycles went unpaid). */
async function suspend(prisma, storeId, { reason, actorId }) {
  const { sub } = await loadSub(prisma, storeId);
  if (sub.status === S.SUSPENDED) throw new HttpError(409, "Already suspended.");
  const now = new Date();
  await prisma.$transaction((tx) =>
    transition(tx, sub, S.SUSPENDED, { type: "admin.suspended", ...admin(actorId), data: { reason }, patch: { suspendedAt: now, lockedAt: sub.lockedAt || now, dunningNextAt: null, nextRetryAt: null } })
  );
}

/** Back to active, with what was owed forgiven. A lapsed period gets a
 * fresh month from today, so billing carries on normally after it. */
async function restore(prisma, storeId, { reason, actorId }) {
  const { sub } = await loadSub(prisma, storeId);
  const now = new Date();
  const open = await prisma.billingCycle.findMany({ where: { subscriptionId: sub.id, status: { in: ["due", "failed"] } } });
  for (const c of open) await charges.settleCycle(prisma, c.id, { waived: true, actor: actorId, now });
  const fresh = await prisma.subscription.findUnique({ where: { id: sub.id } });
  const lapsed = !fresh.currentPeriodEnd || new Date(fresh.currentPeriodEnd) <= now;
  await prisma.$transaction(async (tx) => {
    await transition(tx, fresh, S.ACTIVE, {
      type: "admin.restored",
      ...admin(actorId),
      data: { reason, waivedCycles: open.map((c) => c.id) },
      patch: {
        consecutiveFailures: 0,
        graceEndsAt: null,
        lockedAt: null,
        suspendedAt: null,
        nextRetryAt: null,
        dunningNextAt: null,
        autoRenew: true,
        cancelRequestedAt: null,
        cancelledAt: null,
        expiredAt: null,
        startedAt: fresh.startedAt || now,
        ...(lapsed && { currentPeriodStart: now, currentPeriodEnd: addInterval(now, "month"), nextBillingAt: addInterval(now, "month"), interval: "month", feesSettledThrough: now }),
      },
    });
    await tx.billingFailure.updateMany({ where: { subscriptionId: sub.id, resolvedAt: null }, data: { resolvedAt: now, resolution: "admin_restored" } });
  });
}

/** Full access until a date, whatever the billing state. */
async function grantAccess(prisma, storeId, { until, reason, actorId }) {
  const { sub } = await loadSub(prisma, storeId);
  const date = until ? new Date(until) : null;
  if (date && !(date > new Date())) throw new HttpError(400, "Pick a date in the future.");
  await prisma.subscription.update({ where: { id: sub.id }, data: { accessGrantedUntil: date } });
  await logEvent(prisma, sub, date ? "admin.access_granted" : "admin.access_revoked", { ...admin(actorId), data: { until: date, reason } });
}

/** More trial days — also reopens a trial that ended unpaid. */
async function extendTrial(prisma, storeId, { days, reason, actorId }) {
  const { sub } = await loadSub(prisma, storeId);
  const n = Number(days);
  if (!Number.isInteger(n) || n < 1 || n > 90) throw new HttpError(400, "Extend by 1 to 90 days.");
  const now = new Date();
  if (sub.status === S.TRIALING) {
    const base = sub.trialEndsAt && new Date(sub.trialEndsAt) > now ? new Date(sub.trialEndsAt) : now;
    await prisma.subscription.update({ where: { id: sub.id }, data: { trialEndsAt: addDays(base, n) } });
    await logEvent(prisma, sub, "admin.trial_extended", { ...admin(actorId), data: { days: n, reason, trialEndsAt: addDays(base, n) } });
    return;
  }
  if (sub.startedAt || ![S.PENDING_PAYMENT, S.SUSPENDED, S.CANCEL_SCHEDULED].includes(sub.status)) {
    throw new HttpError(409, "Only a store that hasn't paid yet can get more trial time — use “Grant access” instead.");
  }
  // Reopen: the unpaid first-month charge is removed so the trial can end
  // (and charge) again later.
  const intro = await prisma.billingCycle.findUnique({ where: { idempotencyKey: `intro:${sub.id}` } });
  await prisma.$transaction(async (tx) => {
    if (intro && ["due", "failed"].includes(intro.status)) {
      await commission.settle(tx, intro.id, "released");
      await tx.billingCycle.delete({ where: { id: intro.id } });
    }
    await transition(tx, sub, S.TRIALING, {
      type: "admin.trial_extended",
      ...admin(actorId),
      data: { days: n, reason, reopened: true },
      patch: { trialEndsAt: addDays(now, n), consecutiveFailures: 0, lockedAt: null, suspendedAt: null, dunningNextAt: null, lastFailureAt: null, autoRenew: true, cancelRequestedAt: null, currentPeriodEnd: null, expiredAt: null },
    });
    await tx.billingFailure.updateMany({ where: { subscriptionId: sub.id, resolvedAt: null }, data: { resolvedAt: now, resolution: "trial_extended" } });
  });
}

/** Moves a store to a plan now, with no charge or proration. */
async function changePlan(prisma, storeId, { planId, interval, reason, actorId }) {
  const { store, sub } = await loadSub(prisma, storeId);
  const plan = await prisma.plan.findUnique({ where: { id: String(planId) } });
  if (!plan || !plan.key) throw new HttpError(400, "Unknown plan.");
  const iv = interval === "year" || interval === "month" ? interval : sub.interval;
  await prisma.$transaction(async (tx) => {
    await transition(tx, sub, sub.status, {
      type: "admin.plan_changed",
      ...admin(actorId),
      data: { fromPlanId: sub.planId, toPlanId: plan.id, fromInterval: sub.interval, toInterval: iv, reason },
      patch: { planId: plan.id, interval: iv, pendingPlanId: null, pendingInterval: null },
    });
    await syncStorePlan(tx, store.id, plan.id);
  });
}

/** A special price (before tax) for the next N renewals; null clears it. */
async function setPromo(prisma, storeId, { price, cycles: count, note, actorId }) {
  const { sub } = await loadSub(prisma, storeId);
  const clear = price == null || price === "";
  const p = clear ? null : round2(Number(price));
  if (!clear && !(p >= 0)) throw new HttpError(400, "Enter a price of ₹0 or more.");
  const n = count == null || count === "" ? null : Number(count);
  if (n != null && (!Number.isInteger(n) || n < 1 || n > 36)) throw new HttpError(400, "Apply it for 1 to 36 renewals, or leave empty for all.");
  await prisma.subscription.update({ where: { id: sub.id }, data: { promoPrice: p, promoCyclesLeft: clear ? null : n, promoNote: clear ? null : note ? String(note).slice(0, 200) : null } });
  await logEvent(prisma, sub, clear ? "admin.promo_cleared" : "admin.promo_set", { ...admin(actorId), data: { price: p, cycles: n, note } });
}

/** Sends the most relevant reminder now. */
async function remind(prisma, storeId, { actorId }) {
  const { store, sub } = await loadSub(prisma, storeId);
  const settings = await getSettings(prisma);
  const key = (t) => `${t}:${sub.id}:admin:${Date.now()}`;
  const plan = await prisma.plan.findUnique({ where: { id: sub.planId } });
  const open = await cycles.outstanding(prisma, sub.id);
  let type;
  if (sub.status === S.TRIALING) {
    const mandate = await charges.activeMandate(prisma, sub.id);
    const next = await cycles.estimateNext(prisma, store, sub, plan, { settings });
    type = "trial_ending";
    await notify(prisma, store, type, { planName: plan.name, trialEndsAt: sub.trialEndsAt, mandateActive: Boolean(mandate), introTotal: next?.total || 0 }, { dedupeKey: key(type) });
  } else if (UNPAID.includes(sub.status)) {
    type = sub.status === S.SUSPENDED ? "store_suspended" : sub.lockedAt || sub.status === S.PENDING_PAYMENT ? "dashboard_locked" : "grace_ending";
    const amount = open ? num(open.total) : tax(periodPrice(plan, sub.interval, settings), settings.taxRate, store.billingState).total;
    await notify(prisma, store, type, { amount, graceEndsAt: sub.graceEndsAt, maxFailures: settings.maxConsecutiveFailures }, { dedupeKey: key(type) });
  } else if (sub.status === S.ACTIVE && sub.nextBillingAt) {
    const next = await cycles.estimateNext(prisma, store, sub, plan, { settings });
    type = "billing_reminder";
    const days = Math.max(0, Math.ceil((new Date(sub.nextBillingAt) - Date.now()) / DAY));
    await notify(prisma, store, type, { days, dueAt: sub.nextBillingAt, amount: next?.total || 0, fees: next?.fees || 0, planName: plan.name }, { dedupeKey: key(type) });
  } else {
    throw new HttpError(409, "Nothing to remind this store about right now.");
  }
  await logEvent(prisma, sub, "admin.reminder_sent", { ...admin(actorId), data: { type } });
  return { type };
}

/** Charges the outstanding cycle on the mandate now. */
async function retry(prisma, storeId, { actorId, log }) {
  const { sub } = await loadSub(prisma, storeId);
  const open = await cycles.outstanding(prisma, sub.id);
  if (!open) throw new HttpError(409, "Nothing is outstanding.");
  if (open.status === "processing") throw new HttpError(409, "A charge is already with the bank.");
  await logEvent(prisma, sub, "admin.retry", { ...admin(actorId), data: { cycleId: open.id } });
  return charges.chargeCycle(prisma, open.id, { log });
}

async function waiveCycle(prisma, storeId, cycleId, { reason, actorId }) {
  const { sub } = await loadSub(prisma, storeId);
  const cycle = await prisma.billingCycle.findFirst({ where: { id: cycleId, subscriptionId: sub.id } });
  if (!cycle || !["due", "failed"].includes(cycle.status)) throw new HttpError(409, "Only an unpaid charge can be waived.");
  await charges.settleCycle(prisma, cycle.id, { waived: true, actor: actorId });
  await logEvent(prisma, sub, "admin.cycle_waived", { ...admin(actorId), data: { cycleId, reason } });
}

/** Ends the subscription now: store offline, autopay cancelled. */
async function cancelNow(prisma, storeId, { reason, actorId, log }) {
  const { sub } = await loadSub(prisma, storeId);
  if (sub.status === S.CANCELLED) throw new HttpError(409, "Already cancelled.");
  const live = await prisma.mandate.findMany({ where: { subscriptionId: sub.id, status: { in: ["active", "pending", "paused"] } } });
  for (const m of live) await mandates.cancel(prisma, m, { reason: "Cancelled by Oyklane", log, actorType: "admin", actorId });
  const now = new Date();
  await prisma.$transaction((tx) =>
    transition(tx, sub, S.CANCELLED, { type: "admin.cancelled", ...admin(actorId), data: { reason }, patch: { cancelledAt: now, autoRenew: false, nextBillingAt: null, dunningNextAt: null, nextRetryAt: null } })
  );
}

async function refund(prisma, storeId, paymentId, { amount, reason, actorId, log }) {
  const payment = await prisma.billingPayment.findFirst({ where: { id: paymentId, storeId } });
  if (!payment) throw new HttpError(404, "Payment not found");
  try {
    return await charges.refundPayment(prisma, payment.id, { amount, reason, actor: actorId, log });
  } catch (err) {
    if (err.statusCode && !err.status) throw new HttpError(err.statusCode, err.message);
    throw err;
  }
}

/** A feature on/off, or a higher limit ("limit.staff"), for one store. */
async function grantEntitlement(prisma, storeId, { key, value, expiresAt, reason, actorId }) {
  const { sub } = await loadSub(prisma, storeId);
  const known = await prisma.feature.findUnique({ where: { key: String(key).replace(/^limit\./, "") } });
  if (!known) throw new HttpError(400, "Unknown feature.");
  const isLimit = String(key).startsWith("limit.");
  if (isLimit && !(Number.isInteger(Number(value)) && Number(value) >= 0)) throw new HttpError(400, "Enter a whole number.");
  const grant = await prisma.entitlementGrant.create({
    data: { storeId, key: String(key), value: isLimit ? Number(value) : Boolean(value), reason: reason || null, grantedBy: actorId, expiresAt: expiresAt ? new Date(expiresAt) : null },
  });
  await logEvent(prisma, sub, "admin.entitlement_granted", { ...admin(actorId), data: { key, value, expiresAt, reason } });
  return grant;
}

async function revokeEntitlement(prisma, storeId, grantId, { actorId }) {
  const grant = await prisma.entitlementGrant.findFirst({ where: { id: grantId, storeId, revokedAt: null } });
  if (!grant) throw new HttpError(404, "Grant not found");
  await prisma.entitlementGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
  const { sub } = await loadSub(prisma, storeId);
  await logEvent(prisma, sub, "admin.entitlement_revoked", { ...admin(actorId), data: { key: grant.key } });
}

async function listLimitRequests(prisma, { status = "pending" } = {}) {
  const rows = await prisma.limitRequest.findMany({
    where: status === "all" ? {} : { status },
    include: { store: { select: { id: true, name: true, handle: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows;
}

async function decideLimitRequest(prisma, requestId, { approve, value, note, actorId }) {
  const req = await prisma.limitRequest.findUnique({ where: { id: requestId }, include: { store: true } });
  if (!req || req.status !== "pending") throw new HttpError(404, "Request not found or already decided.");
  const granted = approve ? Number(value || req.requested) : null;
  if (approve && !(Number.isInteger(granted) && granted > 0)) throw new HttpError(400, "Enter the new limit.");
  await prisma.limitRequest.update({ where: { id: req.id }, data: { status: approve ? "approved" : "rejected", decidedBy: actorId, decidedAt: new Date(), note: note || null } });
  if (approve) await grantEntitlement(prisma, req.storeId, { key: `limit.${req.key}`, value: granted, reason: `Limit request ${req.id}`, actorId });
  await notify(prisma, req.store, "limit_request", { approved: approve, value: granted, note }, { dedupeKey: `limit_request:${req.id}` });
}

// ── Plans & features ─────────────────────────────────────────────────

async function featureMatrix(prisma) {
  const [features, plans] = await Promise.all([
    prisma.feature.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.plan.findMany({ where: { key: { not: null } }, orderBy: { sortOrder: "asc" }, include: { features: true, _count: { select: { subscriptions: true } } } }),
  ]);
  const settings = await getSettings(prisma);
  return {
    features,
    plans: plans.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      tagline: p.tagline,
      isActive: p.isActive,
      priceMonthly: num(p.priceMonthly),
      priceYearly: periodPrice(p, "year", settings),
      commissionPercent: num(p.commissionPercent),
      staffLimit: entitlements.planStaffLimit(p),
      subscriptions: p._count.subscriptions,
      features: Object.fromEntries(p.features.map((f) => [f.featureKey, { enabled: f.enabled, limitValue: f.limitValue }])),
    })),
  };
}

async function updatePlan(prisma, planId, input, { actorId }) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.key) throw new HttpError(404, "Plan not found");
  const data = {};
  if (input.name !== undefined) data.name = String(input.name).trim().slice(0, 60);
  if (input.tagline !== undefined) data.tagline = String(input.tagline || "").slice(0, 200) || null;
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);
  if (input.priceMonthly !== undefined) {
    const n = Number(input.priceMonthly);
    if (!(n >= 0 && n <= 1000000)) throw new HttpError(400, "Enter a monthly price.");
    data.priceMonthly = round2(n);
  }
  if (input.commissionPercent !== undefined) {
    const n = Number(input.commissionPercent);
    if (!(n >= 0 && n <= 20)) throw new HttpError(400, "Commission must be between 0% and 20%.");
    data.commissionPercent = round2(n);
  }
  if (input.staffLimit !== undefined) {
    const n = Number(input.staffLimit);
    if (!(Number.isInteger(n) && n >= 0 && n <= 10000)) throw new HttpError(400, "Enter a whole number of staff accounts.");
    data.staffLimit = n;
    await prisma.planFeature.upsert({ where: { planId_featureKey: { planId, featureKey: "staff" } }, update: { enabled: true, limitValue: n }, create: { planId, featureKey: "staff", enabled: true, limitValue: n } });
  }
  try {
    return await prisma.plan.update({ where: { id: planId }, data });
  } catch (err) {
    if (err.code === "P2002") throw new HttpError(409, "Another plan already has that name.");
    throw err;
  }
}

async function setPlanFeatures(prisma, planId, changes) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.key) throw new HttpError(404, "Plan not found");
  const keys = new Set((await prisma.feature.findMany({ select: { key: true } })).map((f) => f.key));
  for (const [featureKey, v] of Object.entries(changes || {})) {
    if (!keys.has(featureKey) || featureKey === "staff") continue;
    await prisma.planFeature.upsert({
      where: { planId_featureKey: { planId, featureKey } },
      update: { enabled: Boolean(v) },
      create: { planId, featureKey, enabled: Boolean(v) },
    });
  }
}

module.exports = {
  overview,
  listSubscriptions,
  detail,
  suspend,
  restore,
  grantAccess,
  extendTrial,
  changePlan,
  setPromo,
  remind,
  retry,
  waiveCycle,
  cancelNow,
  refund,
  grantEntitlement,
  revokeEntitlement,
  listLimitRequests,
  decideLimitRequest,
  featureMatrix,
  updatePlan,
  setPlanFeatures,
  getSettings,
  saveSettings,
};
