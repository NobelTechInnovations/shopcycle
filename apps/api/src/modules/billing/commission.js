const { round2, num } = require("./money");
const { getSettings } = require("./settings");

/**
 * Oyklane's checkout commission — one CommissionTransaction per order.
 *
 * The rates are the ones saved on the order when it was placed
 * (Order.feeCommissionRate from the store's plan, plus
 * Order.feeOneClickRate when the One-Click Checkout app was used), so a
 * later plan change never re-prices an old order. Orders a seller creates
 * by hand carry no rate and pay no fee.
 *
 *   accrued → billed (added to a billing cycle) → paid (cycle paid)
 *   void    — the order was refunded/cancelled before it was billed
 *   reversal (negative) — refunded/cancelled after billing; nets off the
 *             next cycle
 *
 * Every function is idempotent: it's called from checkout, status
 * changes, refunds and webhooks, any of which may repeat.
 */
const IST_OFFSET_MS = 330 * 60 * 1000;
function monthKey(date) {
  const t = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

const ignoreDuplicate = (err) => {
  if (err.code !== "P2002") throw err;
};

/**
 * The fee terms saved on an order when it's placed: the store's plan rate,
 * and the One-Click Checkout surcharge when the order came through that
 * app. Returns Order fields.
 */
async function feeSnapshot(prisma, storeId, { oneClick = false } = {}) {
  const sub = await prisma.subscription.findUnique({ where: { storeId }, select: { planId: true, plan: { select: { commissionPercent: true } } } });
  if (!sub) return {};
  let oneClickActive = false;
  if (oneClick) {
    const app = await prisma.app.findUnique({ where: { key: "one-click-checkout" }, select: { id: true } });
    oneClickActive = Boolean(app && (await prisma.storeApp.findUnique({ where: { storeId_appId: { storeId, appId: app.id } }, select: { id: true } })));
  }
  const settings = await getSettings(prisma);
  return {
    feePlanId: sub.planId,
    feeCommissionRate: num(sub.plan.commissionPercent),
    feeOneClickRate: oneClickActive ? Number(settings.oneClickFeePercent) : 0,
    oneClickCheckout: oneClickActive,
  };
}

/** Brings an order's commission in line with its payment/fulfilment state. */
async function syncOrderCommission(prisma, orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      storeId: true,
      orderNumber: true,
      total: true,
      giftCardAmount: true,
      currency: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      createdAt: true,
      feePlanId: true,
      feeCommissionRate: true,
      feeOneClickRate: true,
      oneClickCheckout: true,
    },
  });
  if (!order || order.feeCommissionRate == null) return;

  const rows = await prisma.commissionTransaction.findMany({ where: { orderId } });
  const accrual = rows.find((r) => r.kind === "accrual");
  const reversal = rows.find((r) => r.kind === "reversal");
  // A partial refund keeps the fee (the sale happened); a full refund or
  // a cancellation reverses it.
  const earning = ["paid", "partially_refunded"].includes(order.paymentStatus) && order.fulfillmentStatus !== "cancelled";
  const touched = new Set();

  if (earning) {
    if (!accrual) {
      const settings = await getSettings(prisma);
      // The fee is on money actually paid — not the part paid with the
      // store's own gift card.
      const base = round2(num(order.total) - num(order.giftCardAmount));
      const rate = num(order.feeCommissionRate);
      const oneClickRate = order.oneClickCheckout ? num(order.feeOneClickRate) : 0;
      if (base <= 0 || rate + oneClickRate <= 0) return;
      const commissionAmount = round2((base * rate) / 100);
      const oneClickAmount = round2((base * oneClickRate) / 100);
      const baseFee = round2(commissionAmount + oneClickAmount);
      const taxAmount = round2((baseFee * Number(settings.taxRate)) / 100);
      const month = monthKey(order.createdAt);
      await prisma.commissionTransaction
        .create({
          data: {
            storeId: order.storeId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            planId: order.feePlanId,
            kind: "accrual",
            orderAmount: base,
            commissionRate: rate,
            oneClickActive: Boolean(order.oneClickCheckout),
            oneClickRate,
            commissionAmount,
            oneClickAmount,
            baseFee,
            taxRate: settings.taxRate,
            taxAmount,
            totalFee: round2(baseFee + taxAmount),
            currency: order.currency || "INR",
            periodMonth: month,
          },
        })
        .catch(ignoreDuplicate);
      touched.add(month);
    } else if (accrual.status === "void") {
      await prisma.commissionTransaction.update({ where: { id: accrual.id }, data: { status: "accrued" } });
      touched.add(accrual.periodMonth);
    } else if (reversal && reversal.status === "accrued") {
      // Re-marked paid after a refund that hadn't been billed yet.
      await prisma.commissionTransaction.update({ where: { id: reversal.id }, data: { status: "void" } });
      touched.add(reversal.periodMonth);
    }
  } else if (accrual && accrual.status !== "void") {
    if (accrual.status === "accrued") {
      await prisma.commissionTransaction.update({ where: { id: accrual.id }, data: { status: "void" } });
      touched.add(accrual.periodMonth);
    } else if (!reversal) {
      // Already billed or paid — credit it back on the next cycle.
      const month = monthKey(new Date());
      await prisma.commissionTransaction
        .create({
          data: {
            storeId: accrual.storeId,
            orderId: accrual.orderId,
            orderNumber: accrual.orderNumber,
            planId: accrual.planId,
            kind: "reversal",
            orderAmount: -num(accrual.orderAmount),
            commissionRate: accrual.commissionRate,
            oneClickActive: accrual.oneClickActive,
            oneClickRate: accrual.oneClickRate,
            commissionAmount: -num(accrual.commissionAmount),
            oneClickAmount: -num(accrual.oneClickAmount),
            baseFee: -num(accrual.baseFee),
            taxRate: accrual.taxRate,
            taxAmount: -num(accrual.taxAmount),
            totalFee: -num(accrual.totalFee),
            currency: accrual.currency,
            periodMonth: month,
          },
        })
        .catch(ignoreDuplicate);
      touched.add(month);
    }
  }

  for (const month of touched) await refreshSummary(prisma, order.storeId, month);
}

/** Recomputes one month's CommissionSummary from its transactions. */
async function refreshSummary(db, storeId, month) {
  const where = { storeId, periodMonth: month, status: { not: "void" } };
  const [sum, accruals, reversals] = await Promise.all([
    db.commissionTransaction.aggregate({
      where,
      _sum: { orderAmount: true, commissionAmount: true, oneClickAmount: true, baseFee: true, taxAmount: true, totalFee: true },
    }),
    db.commissionTransaction.count({ where: { ...where, kind: "accrual" } }),
    db.commissionTransaction.count({ where: { ...where, kind: "reversal" } }),
  ]);
  const s = sum._sum;
  const data = {
    orders: Math.max(0, accruals - reversals),
    orderAmount: round2(num(s.orderAmount)),
    commissionAmount: round2(num(s.commissionAmount)),
    oneClickAmount: round2(num(s.oneClickAmount)),
    baseFee: round2(num(s.baseFee)),
    taxAmount: round2(num(s.taxAmount)),
    totalFee: round2(num(s.totalFee)),
  };
  await db.commissionSummary.upsert({
    where: { storeId_month: { storeId, month } },
    update: data,
    create: { storeId, month, ...data },
  });
}

/** Net fees waiting to be billed (before tax). */
async function accruedTotal(db, storeId) {
  const s = await db.commissionTransaction.aggregate({ where: { storeId, status: "accrued" }, _sum: { baseFee: true }, _count: { _all: true } });
  return { amount: round2(num(s._sum.baseFee)), count: s._count._all };
}

/**
 * Moves everything accrued onto a billing cycle. Refund credits net off
 * first; if the net is zero or negative nothing is billed and it all
 * waits for the next cycle. Returns the net fee (before tax).
 */
async function collect(tx, storeId, cycleId) {
  const rows = await tx.commissionTransaction.findMany({ where: { storeId, status: "accrued" }, select: { id: true, baseFee: true, kind: true } });
  const net = round2(rows.reduce((s, r) => s + num(r.baseFee), 0));
  if (!rows.length || net <= 0) return { amount: 0, orders: 0 };
  await tx.commissionTransaction.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "billed", cycleId } });
  return { amount: net, orders: rows.filter((r) => r.kind === "accrual").length };
}

/** After a cycle is settled: paid (with the invoice), or back to accrued
 * when the cycle was voided, or void when the platform waived it. */
async function settle(tx, cycleId, outcome, invoiceId = null) {
  if (outcome === "paid") {
    await tx.commissionTransaction.updateMany({ where: { cycleId, status: "billed" }, data: { status: "paid", invoiceId } });
  } else if (outcome === "released") {
    await tx.commissionTransaction.updateMany({ where: { cycleId, status: "billed" }, data: { status: "accrued", cycleId: null } });
  } else if (outcome === "waived") {
    await tx.commissionTransaction.updateMany({ where: { cycleId, status: "billed" }, data: { status: "void" } });
  }
}

/** The seller's billing screen: fees building up, billed, paid, by month. */
async function feeSummary(prisma, storeId) {
  const [grouped, months, recent] = await Promise.all([
    prisma.commissionTransaction.groupBy({
      by: ["status"],
      where: { storeId, status: { not: "void" } },
      _sum: { baseFee: true, taxAmount: true, totalFee: true },
      _count: { _all: true },
    }),
    prisma.commissionSummary.findMany({ where: { storeId }, orderBy: { month: "desc" }, take: 12 }),
    prisma.commissionTransaction.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);
  const pick = (status) => {
    const g = grouped.find((x) => x.status === status);
    return { amount: round2(num(g?._sum.baseFee)), tax: round2(num(g?._sum.taxAmount)), total: round2(num(g?._sum.totalFee)), count: g?._count._all || 0 };
  };
  return {
    accrued: pick("accrued"),
    billed: pick("billed"),
    paid: pick("paid"),
    currentMonth: monthKey(new Date()),
    months: months.map((m) => ({
      month: m.month,
      orders: m.orders,
      orderAmount: num(m.orderAmount),
      commissionAmount: num(m.commissionAmount),
      oneClickAmount: num(m.oneClickAmount),
      baseFee: num(m.baseFee),
      taxAmount: num(m.taxAmount),
      totalFee: num(m.totalFee),
    })),
    recent: recent.map(serializeTransaction),
  };
}

function serializeTransaction(t) {
  return {
    id: t.id,
    orderId: t.orderId,
    orderNumber: t.orderNumber,
    kind: t.kind,
    orderAmount: num(t.orderAmount),
    commissionRate: num(t.commissionRate),
    oneClickActive: t.oneClickActive,
    oneClickRate: num(t.oneClickRate),
    commissionAmount: num(t.commissionAmount),
    oneClickAmount: num(t.oneClickAmount),
    baseFee: num(t.baseFee),
    taxRate: num(t.taxRate),
    taxAmount: num(t.taxAmount),
    totalFee: num(t.totalFee),
    currency: t.currency,
    status: t.status,
    periodMonth: t.periodMonth,
    createdAt: t.createdAt,
  };
}

module.exports = { feeSnapshot, syncOrderCommission, refreshSummary, accruedTotal, collect, settle, feeSummary, serializeTransaction, monthKey, round2 };
