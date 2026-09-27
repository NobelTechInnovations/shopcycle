/**
 * The platform console's home: how the business is doing at a glance —
 * recurring revenue, stores by billing state, who needs attention (trials
 * ending, failed payments), what merchants are selling, and new signups.
 */

const billingAdmin = require("../billing/admin");

const DAY = 24 * 60 * 60 * 1000;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const PAID = ["paid", "partially_refunded"];

async function overview(prisma) {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since60 = new Date(now.getTime() - 60 * DAY);
  const weekAhead = new Date(now.getTime() + 7 * DAY);

  const [byStatus, suspended, billing, trialsEnding, pastDue, gmv, gmvPrev, signups, topSales] = await Promise.all([
    prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.store.count({ where: { status: "suspended" } }),
    billingAdmin.overview(prisma),
    prisma.subscription.findMany({
      where: { status: "TRIALING", trialEndsAt: { gte: now, lte: weekAhead } },
      select: { trialEndsAt: true, store: { select: { id: true, name: true, handle: true } }, plan: { select: { name: true, priceMonthly: true } } },
      orderBy: { trialEndsAt: "asc" },
      take: 8,
    }),
    prisma.subscription.findMany({
      where: { status: { in: ["PENDING_PAYMENT", "GRACE_PERIOD", "PAST_DUE", "SUSPENDED"] } },
      select: { status: true, currentPeriodEnd: true, lastFailureAt: true, store: { select: { id: true, name: true, handle: true } }, plan: { select: { name: true, priceMonthly: true } } },
      orderBy: { lastFailureAt: "desc" },
      take: 8,
    }),
    prisma.order.aggregate({ where: { paymentStatus: { in: PAID }, createdAt: { gte: since30 } }, _sum: { total: true }, _count: { _all: true } }),
    prisma.order.aggregate({ where: { paymentStatus: { in: PAID }, createdAt: { gte: since60, lt: since30 } }, _sum: { total: true }, _count: { _all: true } }),
    prisma.store.findMany({ where: { createdAt: { gte: since30 } }, select: { createdAt: true } }),
    prisma.order.groupBy({
      by: ["storeId"],
      where: { paymentStatus: { in: PAID }, createdAt: { gte: since30 } },
      _sum: { total: true },
      _count: { _all: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    }),
  ]);

  const count = (...statuses) => byStatus.filter((g) => statuses.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
  const mrr = billing.mrr;
  const atRisk = round2(pastDue.reduce((sum, s) => sum + Number(s.plan?.priceMonthly || 0), 0));

  // New stores per day, oldest first, for the last 30 days (IST calendar days).
  const dayKey = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const perDay = new Map();
  for (let i = 29; i >= 0; i -= 1) perDay.set(dayKey(now.getTime() - i * DAY), 0);
  for (const s of signups) {
    const k = dayKey(s.createdAt);
    if (perDay.has(k)) perDay.set(k, perDay.get(k) + 1);
  }

  const storeNames = topSales.length
    ? await prisma.store.findMany({ where: { id: { in: topSales.map((t) => t.storeId) } }, select: { id: true, name: true, handle: true } })
    : [];

  return {
    mrr,
    arr: round2(mrr * 12),
    stores: {
      total: byStatus.reduce((n, g) => n + g._count._all, 0),
      paying: count("ACTIVE", "CANCEL_SCHEDULED"),
      trialing: count("TRIALING"),
      noPlan: count("PENDING_PAYMENT"),
      pastDue: count("GRACE_PERIOD", "PAST_DUE"),
      cancelled: count("CANCELLED", "EXPIRED"),
      suspended: suspended + count("SUSPENDED"),
      new30: signups.length,
    },
    atRisk,
    trialsEnding: trialsEnding.map((s) => ({ ...s.store, trialEndsAt: s.trialEndsAt, plan: { name: s.plan.name, priceMonthly: Number(s.plan.priceMonthly) } })),
    pastDue: pastDue.map((s) => ({ ...s.store, status: s.status, currentPeriodEnd: s.currentPeriodEnd, lastFailureAt: s.lastFailureAt, plan: { name: s.plan.name, priceMonthly: Number(s.plan.priceMonthly) } })),
    gmv: {
      last30: round2(gmv._sum.total || 0),
      prev30: round2(gmvPrev._sum.total || 0),
      orders30: gmv._count._all,
      ordersPrev30: gmvPrev._count._all,
    },
    fees: { accrued: billing.fees.accrued, scheduled: billing.fees.billed, paid: billing.fees.paid },
    billing: { revenue: billing.revenue, gst: billing.gst, failedPayments30: billing.failedPayments30, statuses: billing.statuses },
    signupsByDay: [...perDay.entries()].map(([date, n]) => ({ date, count: n })),
    topStores: topSales.map((t) => {
      const s = storeNames.find((x) => x.id === t.storeId);
      return { id: t.storeId, name: s?.name || "—", handle: s?.handle || null, sales: round2(t._sum.total || 0), orders: t._count._all };
    }),
  };
}

module.exports = { overview };
