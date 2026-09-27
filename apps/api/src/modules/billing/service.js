const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { getSettings } = require("./settings");
const { billingMode, provider } = require("./providers");
const { periodPrice } = require("./pricing");
const { tax, num, round2 } = require("./money");
const { computeAccess } = require("./access");
const { S } = require("./state");
const cycles = require("./cycles");
const charges = require("./charges");
const mandates = require("./mandates");
const commission = require("./commission");
const appCharges = require("./app-charges");
const entitlements = require("./entitlements");
const subscriptions = require("./subscriptions");
const planChange = require("./plan-change");

/**
 * The seller side of billing, used by /api/billing. The admin derives
 * everything it shows — locks included — from `overview`; it never
 * decides access itself.
 */

/** Plans for the pricing table, with yearly prices and features. */
async function listPlans(prisma, { settings, store } = {}) {
  const s = settings || (await getSettings(prisma));
  const [plans, features] = await Promise.all([
    prisma.plan.findMany({ where: { isActive: true, key: { not: null } }, orderBy: { sortOrder: "asc" }, include: { features: true } }),
    prisma.feature.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const featureName = Object.fromEntries(features.map((f) => [f.key, f]));
  return plans.map((p) => {
    const monthly = periodPrice(p, "month", s);
    const yearly = periodPrice(p, "year", s);
    const staff = entitlements.planStaffLimit(p);
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      tagline: p.tagline,
      description: p.description,
      priceMonthly: monthly,
      priceYearly: yearly,
      yearlyPerMonth: round2(yearly / 12),
      yearlySavings: round2(monthly * 12 - yearly),
      commissionPercent: num(p.commissionPercent),
      staffLimit: staff,
      productLimit: p.productLimit,
      // What the seller pays at checkout for each (tax included).
      withTax: {
        month: tax(monthly, s.taxRate, store?.billingState).total,
        year: tax(yearly, s.taxRate, store?.billingState).total,
        intro: tax(s.introPrice, s.taxRate, store?.billingState).total,
      },
      features: p.features
        .filter((f) => f.enabled && f.featureKey !== "staff" && featureName[f.featureKey])
        .sort((a, b) => featureName[a.featureKey].sortOrder - featureName[b.featureKey].sortOrder)
        .map((f) => ({ key: f.featureKey, name: featureName[f.featureKey].name, category: featureName[f.featureKey].category })),
    };
  });
}

function publicSettings(s) {
  return {
    taxRate: Number(s.taxRate),
    trialDays: s.trialDays,
    introEnabled: s.introEnabled,
    introPrice: Number(s.introPrice),
    annualDiscountPercent: Number(s.annualDiscountPercent),
    graceDays: s.graceDays,
    maxConsecutiveFailures: s.maxConsecutiveFailures,
    oneClickFeePercent: Number(s.oneClickFeePercent),
    mandateMaxAmount: s.mandateMaxAmount,
    supportEmail: s.supportEmail,
  };
}

/** Everything the billing screens show, computed server-side. */
async function overview(prisma, store, { log } = {}) {
  const settings = await getSettings(prisma);
  const sub = await subscriptions.forStore(prisma, store);
  if (!sub) {
    return { mode: billingMode(), subscription: null, access: computeAccess(null), plans: await listPlans(prisma, { settings, store }), settings: publicSettings(settings) };
  }
  subscriptions.welcome(prisma, store, sub, { log }).catch(() => {});

  const now = new Date();
  const [mandate, open, plans, fees, ent, staffUsed, notices, pendingPlan, lastPayments] = await Promise.all([
    prisma.mandate.findFirst({ where: { subscriptionId: sub.id, status: { in: ["active", "pending", "paused"] } }, orderBy: { createdAt: "desc" }, include: { paymentMethod: true } }),
    cycles.outstanding(prisma, sub.id),
    listPlans(prisma, { settings, store }),
    commission.feeSummary(prisma, store.id),
    entitlements.forStore(prisma, store.id, { planId: sub.planId }),
    entitlements.staffUsage(prisma, store.id),
    prisma.billingNotification.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    sub.pendingPlanId ? prisma.plan.findUnique({ where: { id: sub.pendingPlanId }, select: { id: true, name: true } }) : null,
    prisma.billingPayment.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const usable = await charges.activeMandate(prisma, sub.id);
  const access = computeAccess(sub, { now, storeStatus: store.status, mandateActive: Boolean(usable) });
  const next = await cycles.estimateNext(prisma, store, sub, sub.plan, { settings });

  // What the seller would pay on the "Complete your subscription" page.
  let due = open ? cycles.serializeCycle(open) : null;
  if (!due && [S.EXPIRED, S.CANCELLED, S.SUSPENDED].includes(sub.status)) {
    const price = periodPrice(sub.plan, sub.interval, settings);
    const feeAcc = Math.max(0, (await commission.accruedTotal(prisma, store.id)).amount);
    const appsOwed = await appCharges.pendingTotal(prisma, store.id);
    const t = tax(round2(price + feeAcc + appsOwed), settings.taxRate, store.billingState);
    due = { kind: "reactivation", planAmount: price, feesAmount: feeAcc, appsAmount: appsOwed, creditAmount: 0, subtotal: t.taxable, taxRate: t.rate, taxAmount: t.amount, total: t.total, status: "quote" };
  }

  return {
    mode: billingMode(),
    livemode: billingMode() === "razorpay" ? provider().livemode() : false,
    setupHint:
      billingMode() === "unconfigured" && env.NODE_ENV !== "production"
        ? "Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env, or set BILLING_SANDBOX=true to test locally, then restart the API."
        : null,
    subscription: { ...subscriptions.serialize(sub, { settings }), plan: plans.find((p) => p.id === sub.planId) || { id: sub.plan.id, name: sub.plan.name }, pendingPlan },
    access,
    mandate: mandates.serialize(mandate),
    mandateUsable: Boolean(usable),
    due,
    next,
    plans,
    settings: publicSettings(settings),
    fees: { accrued: fees.accrued, billed: fees.billed, paid: fees.paid, currentMonth: fees.currentMonth, months: fees.months.slice(0, 6) },
    entitlements: ent,
    staff: { used: staffUsed, limit: ent.limits.staff },
    notifications: notices.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, severity: n.severity, readAt: n.readAt, createdAt: n.createdAt })),
    recentPayments: lastPayments.map(serializePayment),
    billingDetails: { billingName: store.billingName, gstin: store.gstin, billingAddress: store.billingAddress, billingState: store.billingState },
  };
}

function serializePayment(p) {
  return {
    id: p.id,
    purpose: p.purpose,
    amount: num(p.amount),
    currency: p.currency,
    status: p.status,
    method: p.method,
    refundedAmount: num(p.refundedAmount),
    failureReason: p.failureReason,
    providerPaymentId: p.providerPaymentId,
    cycleId: p.cycleId,
    createdAt: p.createdAt,
    capturedAt: p.capturedAt,
    failedAt: p.failedAt,
  };
}

/** The cycle the seller pays on the checkout page, created on demand. */
async function dueCycle(prisma, store, sub, now = new Date()) {
  const open = await cycles.outstanding(prisma, sub.id);
  if (open) return open;
  const plan = sub.plan || (await prisma.plan.findUnique({ where: { id: sub.planId } }));
  if ([S.EXPIRED, S.CANCELLED, S.SUSPENDED, S.PENDING_PAYMENT].includes(sub.status)) {
    return cycles.reactivationCycle(prisma, store, sub, plan, sub.interval, now);
  }
  if (sub.status === S.TRIALING && sub.trialEndsAt && new Date(sub.trialEndsAt) <= now) {
    return cycles.firstCycle(prisma, store, sub, plan, sub.trialEndsAt);
  }
  return null;
}

/**
 * "Complete your subscription" / "Pay now". Without autopay: sets it up,
 * collecting whatever is due in the same step. With autopay already on
 * and something due: a one-time payment for it.
 */
async function startCheckout(prisma, store, user, { planId, interval, method, now = new Date(), log }) {
  let sub = await subscriptions.forStore(prisma, store);
  if (!sub) throw new HttpError(503, "Billing isn't set up yet. Please try again shortly.");
  if ((planId && planId !== sub.planId) || (interval && interval !== sub.interval)) {
    const p = await planChange.preview(prisma, store, sub, { planId: planId || sub.planId, interval: interval || sub.interval, now });
    if (p.type !== "free" && p.type !== "same") throw new HttpError(409, "Change plans from Settings ▸ Plan & billing.");
    if (p.type === "free") await planChange.change(prisma, store, sub, { planId: planId || sub.planId, interval: interval || sub.interval, now, actorId: user?.id, log });
    sub = await subscriptions.forStore(prisma, store);
  }
  const cycle = await dueCycle(prisma, store, sub, now);
  if (cycle?.status === "processing") {
    throw new HttpError(409, "A payment for this is already with your bank — we'll update this page as soon as it's confirmed.");
  }
  const mandate = await charges.activeMandate(prisma, sub.id);
  if (mandate) {
    if (!cycle) throw new HttpError(409, "Nothing to pay right now — autopay is set up.");
    return startOneTime(prisma, store, sub, cycle, { now, log });
  }
  return mandates.createSetup(prisma, store, sub, { method: method || "upi", cycle, now, log, actorId: user?.id });
}

async function startOneTime(prisma, store, sub, cycle, { now, log }) {
  const p = provider();
  const amount = num(cycle.total);
  const notes = { storeId: store.id, subscriptionId: sub.id, cycleId: cycle.id, purpose: "manual" };
  const order = await p.createPaymentOrder({ amount, receipt: `pay_${cycle.id}`, notes });
  const payment = await prisma.billingPayment.create({
    data: { storeId: store.id, subscriptionId: sub.id, cycleId: cycle.id, purpose: "manual", provider: p.key, providerOrderId: order.orderId, amount, status: "created", attemptedAt: now },
  });
  if (p.key === "sandbox") {
    const paymentId = `pay_sbx${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await prisma.billingPayment.update({ where: { id: payment.id }, data: { providerPaymentId: paymentId } });
    await charges.applyProviderPayment(prisma, { ...payment, providerPaymentId: paymentId }, { id: paymentId, orderId: order.orderId, status: "captured", amount, method: "upi" }, { now, log });
    return { completed: true, amount };
  }
  const { ownerContact } = require("./notifications");
  const who = await ownerContact(prisma, store.id);
  return {
    completed: false,
    amount,
    checkout: p.checkoutOptions({ orderId: order.orderId, amount, name: "Oyklane", description: `${store.name} — subscription`, prefill: { name: who.name || "", email: who.email || "", contact: who.contact || "" }, notes }),
  };
}

/** The checkout window reported success. Verified with the provider —
 * the signature proves it came from Razorpay, and the payment itself is
 * fetched server-side before anything is applied. */
async function verifyCheckout(prisma, store, { orderId, paymentId, signature }, { log } = {}) {
  const payment = orderId ? await prisma.billingPayment.findUnique({ where: { providerOrderId: String(orderId) } }) : null;
  if (!payment || payment.storeId !== store.id) throw new HttpError(404, "We couldn't find this payment.");
  const p = provider(payment.provider);
  if (!p.verifyCheckoutSignature({ orderId, paymentId, signature })) throw new HttpError(400, "We couldn't verify this payment. If money was taken, it will be matched automatically within a few minutes.");
  const pp = await p.fetchPayment(paymentId);
  if (!pp || (pp.orderId && pp.orderId !== payment.providerOrderId)) throw new HttpError(400, "This payment doesn't match your order.");
  if (!payment.providerPaymentId) {
    await prisma.billingPayment.update({ where: { id: payment.id }, data: { providerPaymentId: paymentId } }).catch(() => {});
  }
  if (payment.purpose === "mandate_setup") await mandates.recordToken(prisma, payment, pp);
  const result = await charges.applyProviderPayment(prisma, { ...payment, providerPaymentId: paymentId }, pp, { log });
  return { result, status: pp.status };
}

/** Replace the autopay method (card expired, different bank). */
async function replaceMandate(prisma, store, user, { method, now = new Date(), log }) {
  const sub = await subscriptions.forStore(prisma, store);
  const open = await cycles.outstanding(prisma, sub.id);
  const cycle = open && ["due", "failed"].includes(open.status) ? open : null;
  return mandates.createSetup(prisma, store, sub, { method, cycle, now, log, actorId: user?.id });
}

/** Paged history for the billing screens. */
async function listInvoices(prisma, storeId, { page = 1, pageSize = 20 } = {}) {
  const [rows, total] = await Promise.all([
    prisma.platformInvoice.findMany({ where: { storeId }, orderBy: { issuedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.platformInvoice.count({ where: { storeId } }),
  ]);
  return {
    invoices: rows.map((i) => ({ id: i.id, number: i.number, kind: i.kind, issuedAt: i.issuedAt, periodStart: i.periodStart, periodEnd: i.periodEnd, subtotal: num(i.subtotal ?? i.taxableValue), taxAmount: num(i.taxAmount), total: num(i.total), status: i.status })),
    total,
    page,
    pageSize,
  };
}

async function listPayments(prisma, storeId, { page = 1, pageSize = 20 } = {}) {
  const [rows, total] = await Promise.all([
    prisma.billingPayment.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.billingPayment.count({ where: { storeId } }),
  ]);
  return { payments: rows.map(serializePayment), total, page, pageSize };
}

async function listCommissions(prisma, storeId, { month, page = 1, pageSize = 50 } = {}) {
  const where = { storeId, ...(month && { periodMonth: month }) };
  const [rows, total, summary] = await Promise.all([
    prisma.commissionTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.commissionTransaction.count({ where }),
    commission.feeSummary(prisma, storeId),
  ]);
  return { transactions: rows.map(commission.serializeTransaction), total, page, pageSize, summary };
}

/** Seller asks for more staff accounts than the plan includes. */
async function requestLimit(prisma, store, { requested, reason }) {
  const ent = await entitlements.forStore(prisma, store.id);
  const current = ent.limits.staff ?? 0;
  const n = Number(requested);
  if (!Number.isInteger(n) || n <= current || n > 500) throw new HttpError(400, `Ask for more than your current ${current} staff accounts (up to 500).`);
  const pending = await prisma.limitRequest.findFirst({ where: { storeId: store.id, key: "staff", status: "pending" } });
  if (pending) throw new HttpError(409, "You already have a request waiting — we'll get back to you soon.");
  return prisma.limitRequest.create({ data: { storeId: store.id, key: "staff", currentLimit: current, requested: n, reason: reason ? String(reason).slice(0, 1000) : null } });
}

module.exports = { overview, listPlans, publicSettings, dueCycle, startCheckout, verifyCheckout, replaceMandate, listInvoices, listPayments, listCommissions, requestLimit, serializePayment };
