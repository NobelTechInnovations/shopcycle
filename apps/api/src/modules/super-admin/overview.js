/**
 * The platform console's home: how the business is doing at a glance —
 * recurring revenue, stores by billing state, who needs attention (trials
 * ending, failed payments), what merchants are selling, and new signups.
 */

const DAY = 24 * 60 * 60 * 1000;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const PAID = ["paid", "partially_refunded"];

async function overview(prisma) {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since60 = new Date(now.getTime() - 60 * DAY);
  const weekAhead = new Date(now.getTime() + 7 * DAY);

  const [byStatus, suspended, payingStores, trialsEnding, pastDue, gmv, gmvPrev, fees, signups, topSales] = await Promise.all([
    prisma.store.groupBy({ by: ["subscriptionStatus"], _count: { _all: true } }),
    prisma.store.count({ where: { status: "suspended" } }),
    prisma.store.findMany({ where: { subscriptionStatus: "active" }, select: { plan: { select: { priceMonthly: true } } } }),
    prisma.store.findMany({
      where: { subscriptionStatus: "trialing", trialEndsAt: { gte: now, lte: weekAhead } },
      select: { id: true, name: true, handle: true, trialEndsAt: true, plan: { select: { name: true, priceMonthly: true } } },
      orderBy: { trialEndsAt: "asc" },
      take: 8,
    }),
    prisma.store.findMany({
      where: { subscriptionStatus: "past_due" },
      select: { id: true, name: true, handle: true, currentPeriodEnd: true, plan: { select: { name: true, priceMonthly: true } } },
      orderBy: { currentPeriodEnd: "asc" },
      take: 8,
    }),
    prisma.order.aggregate({ where: { paymentStatus: { in: PAID }, createdAt: { gte: since30 } }, _sum: { total: true }, _count: { _all: true } }),
    prisma.order.aggregate({ where: { paymentStatus: { in: PAID }, createdAt: { gte: since60, lt: since30 } }, _sum: { total: true }, _count: { _all: true } }),
    prisma.commissionEntry.groupBy({ by: ["status"], where: { status: { not: "void" } }, _sum: { amount: true } }),
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

  const count = (status) => byStatus.find((g) => g.subscriptionStatus === status)?._count._all || 0;
  const mrr = round2(payingStores.reduce((sum, s) => sum + Number(s.plan?.priceMonthly || 0), 0));
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
  const fee = (status) => round2(fees.find((f) => f.status === status)?._sum.amount || 0);

  return {
    mrr,
    arr: round2(mrr * 12),
    stores: {
      total: byStatus.reduce((n, g) => n + g._count._all, 0),
      paying: count("active"),
      trialing: count("trialing"),
      noPlan: count("no_plan"),
      pastDue: count("past_due"),
      cancelled: count("cancelled"),
      suspended,
      new30: signups.length,
    },
    atRisk,
    trialsEnding: trialsEnding.map((s) => ({ ...s, plan: s.plan ? { name: s.plan.name, priceMonthly: Number(s.plan.priceMonthly) } : null })),
    pastDue: pastDue.map((s) => ({ ...s, plan: s.plan ? { name: s.plan.name, priceMonthly: Number(s.plan.priceMonthly) } : null })),
    gmv: {
      last30: round2(gmv._sum.total || 0),
      prev30: round2(gmvPrev._sum.total || 0),
      orders30: gmv._count._all,
      ordersPrev30: gmvPrev._count._all,
    },
    fees: { accrued: fee("accrued"), scheduled: fee("scheduled"), paid: fee("paid") },
    signupsByDay: [...perDay.entries()].map(([date, n]) => ({ date, count: n })),
    topStores: topSales.map((t) => {
      const s = storeNames.find((x) => x.id === t.storeId);
      return { id: t.storeId, name: s?.name || "—", handle: s?.handle || null, sales: round2(t._sum.total || 0), orders: t._count._all };
    }),
  };
}

module.exports = { overview };
