const { createAddon, razorpayConfigured } = require("./razorpay");

/**
 * Oyklane's commission on each paid order (see CommissionEntry in
 * schema.prisma for the full lifecycle). Everything here is idempotent —
 * safe to call again for the same order or the same renewal — because it's
 * triggered from several places (checkout, admin status changes, webhooks
 * that Razorpay may retry).
 */

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Brings an order's commission in line with its current state. Call after
 * any change to an order's payment or fulfillment status.
 *   paid (or partially refunded) & not cancelled
 *                         → an accrual exists (created at the plan's rate)
 *   refunded or cancelled → the accrual is voided if not yet billed, or a
 *                           reversal is added if it already was
 * A store with no plan pays no commission — it hasn't agreed to a rate. */
async function syncOrderCommission(prisma, orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { store: { include: { plan: true } } },
  });
  if (!order) return;

  const entries = await prisma.commissionEntry.findMany({ where: { orderId } });
  const accrual = entries.find((e) => e.kind === "accrual");
  const reversal = entries.find((e) => e.kind === "reversal");
  // A partial refund keeps the fee (the sale still happened, as with card
  // processing fees); only a full refund or a cancellation reverses it.
  const earning = ["paid", "partially_refunded"].includes(order.paymentStatus) && order.fulfillmentStatus !== "cancelled";

  if (earning) {
    if (!accrual) {
      const percent = Number(order.store.plan?.commissionPercent || 0);
      // The fee is on money actually paid for the order — the part paid
      // with a store gift card isn't a new payment.
      const base = round2(Number(order.total) - Number(order.giftCardAmount || 0));
      if (percent <= 0 || base <= 0) return;
      await prisma.commissionEntry
        .create({
          data: {
            storeId: order.storeId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            kind: "accrual",
            orderTotal: base,
            percent,
            amount: round2((base * percent) / 100),
          },
        })
        .catch((err) => {
          if (err.code !== "P2002") throw err; // a concurrent call already created it
        });
    } else if (accrual.status === "void") {
      // Re-marked paid after a cancellation — the fee applies again.
      await prisma.commissionEntry.update({ where: { id: accrual.id }, data: { status: "accrued" } });
    }
    return;
  }

  // Not (or no longer) earning.
  if (!accrual || accrual.status === "void") return;
  if (accrual.status === "accrued") {
    await prisma.commissionEntry.update({ where: { id: accrual.id }, data: { status: "void" } });
  } else if (!reversal) {
    // Already scheduled or paid — credit it back against the next cycle.
    await prisma.commissionEntry
      .create({
        data: {
          storeId: accrual.storeId,
          orderId: accrual.orderId,
          orderNumber: accrual.orderNumber,
          kind: "reversal",
          orderTotal: accrual.orderTotal,
          percent: accrual.percent,
          amount: -Number(accrual.amount),
        },
      })
      .catch((err) => {
        if (err.code !== "P2002") throw err;
      });
  }
}

/** Called once per renewal: everything accrued since the last one is added
 * to the NEXT renewal as a single Razorpay add-on ("billed one cycle in
 * arrears"). Refund reversals net off first; if the net is zero or
 * negative, nothing is billed and the entries wait for the next cycle.
 * Without Razorpay configured the entries simply stay accrued. */
async function scheduleAccruedFees(prisma, store) {
  if (!store.razorpaySubscriptionId || !razorpayConfigured()) return null;
  const pending = await prisma.commissionEntry.findMany({ where: { storeId: store.id, status: "accrued" } });
  const net = round2(pending.reduce((sum, e) => sum + Number(e.amount), 0));
  if (net <= 0) return null;

  const orders = pending.filter((e) => e.kind === "accrual").length;
  const addon = await createAddon(store.razorpaySubscriptionId, {
    name: "Oyklane platform fees",
    description: `Commission on ${orders} order${orders === 1 ? "" : "s"}`,
    amount: net,
  });
  await prisma.commissionEntry.updateMany({
    where: { id: { in: pending.map((e) => e.id) } },
    data: { status: "scheduled", razorpayAddonId: addon.id },
  });
  return { addonId: addon.id, amount: net, entries: pending.length };
}

/** What the billing screen shows: fees building up this cycle, fees already
 * on the next renewal, and lifetime totals. */
async function feeSummary(prisma, storeId) {
  const grouped = await prisma.commissionEntry.groupBy({
    by: ["status", "kind"],
    where: { storeId, status: { not: "void" } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  // Per status: net amount, how many ORDERS earned a fee (accruals), and
  // how many refund credits (reversals) are netted in — so the UI can say
  // "3 orders" and "1 refund credit" instead of counting ledger rows.
  const out = {};
  for (const status of ["accrued", "scheduled", "paid"]) {
    const rows = grouped.filter((g) => g.status === status);
    const count = (kind) => rows.filter((g) => g.kind === kind).reduce((n, g) => n + g._count._all, 0);
    out[status] = {
      amount: round2(rows.reduce((sum, g) => sum + Number(g._sum.amount || 0), 0)),
      count: count("accrual"),
      credits: count("reversal"),
    };
  }
  return out;
}

module.exports = { syncOrderCommission, scheduleAccruedFees, feeSummary, round2 };
