const { HttpError } = require("@shopcycle/utils");
const { adjustStock } = require("../../lib/inventory");
const { razorpayConfigured, razorpayRequest } = require("../billing/razorpay");
const { syncOrderCommission } = require("../billing/commission");
const { formatCurrency } = require("@shopcycle/utils");
const { addOrderEvent } = require("./events");
const { checkSelection, itemQuantities, round2 } = require("./quantities");
const notify = require("./notify");

/**
 * Gives money back — for some items, an amount, or both.
 *
 *   Online (Razorpay) payments → refunded through Razorpay, back to the
 *     shopper's card/UPI/bank. If Razorpay refuses, nothing is recorded.
 *   Cash on delivery / manual → recorded as a manual refund; the merchant
 *     pays the shopper back themselves.
 *
 * Restocking puts refunded items back on sale. The order's paymentStatus
 * becomes partially_refunded or refunded, and a full refund also reverses
 * Oyklane's commission (billing/commission.js); partial refunds don't.
 */
async function createRefund(prisma, store, orderId, input, { actorName, log } = {}) {
  const { loadOrder } = require("./operations");
  const order = await loadOrder(prisma, store.id, orderId);
  if (!["paid", "partially_refunded"].includes(order.paymentStatus)) {
    throw new HttpError(400, order.paymentStatus === "refunded" ? "This order is already fully refunded." : "Only paid orders can be refunded.");
  }
  if (order.cancelledAt && !input.allowCancelled) {
    // Cancelling already refunds; anything further goes through here with
    // allowCancelled from cancelOrder itself.
    const outstanding = Number(order.total) - Number(order.refundedAmount);
    if (outstanding <= 0) throw new HttpError(400, "This order is already fully refunded.");
  }

  const items = checkSelection(order, input.items || [], "refundable", "refund");
  const refundable = round2(Number(order.total) - Number(order.refundedAmount));
  const amount = round2(input.amount ?? 0);
  if (!(amount > 0)) throw new HttpError(400, "Enter an amount to refund.");
  if (amount > refundable) {
    throw new HttpError(400, `You can refund at most ${formatCurrency(refundable, order.currency)} on this order.`);
  }

  // Money first: if the gateway says no, nothing else happens.
  let method = "manual";
  let razorpayRefundId = null;
  let status = "processed";
  if (order.paymentMethod === "razorpay" && order.razorpayPaymentId) {
    if (!razorpayConfigured()) throw new HttpError(400, "Online refunds need Razorpay keys on this platform.");
    const rz = await razorpayRequest(`/payments/${encodeURIComponent(order.razorpayPaymentId)}/refund`, {
      method: "POST",
      body: { amount: Math.round(amount * 100), notes: { orderId: order.id, orderNumber: String(order.orderNumber) } },
    });
    method = "razorpay";
    razorpayRefundId = rz.id || null;
    status = rz.status === "failed" ? "failed" : rz.status === "processed" ? "processed" : "pending";
    if (status === "failed") throw new HttpError(502, "Razorpay couldn't process this refund. Try again, or refund the shopper manually.");
  }

  const quantities = itemQuantities(order);
  const refund = await prisma.$transaction(async (tx) => {
    const created = await tx.refund.create({
      data: {
        orderId,
        storeId: store.id,
        amount,
        reason: input.reason?.trim() || null,
        items,
        restocked: Boolean(input.restock && items.length),
        method,
        razorpayRefundId,
        status,
      },
    });
    if (input.restock) {
      for (const row of items) {
        const item = order.items.find((i) => i.id === row.orderItemId);
        if (!item?.variantId) continue;
        // Shipped items come back as returns; unshipped ones never left.
        const reason = quantities[row.orderItemId].fulfilled > 0 ? "returned" : "order_cancelled";
        await adjustStock(tx, { storeId: store.id, variantId: item.variantId, delta: row.quantity, reason, orderId, actorName });
      }
    }
    const refundedAmount = round2(Number(order.refundedAmount) + amount);
    await tx.order.update({
      where: { id: orderId },
      data: {
        refundedAmount,
        paymentStatus: refundedAmount >= Number(order.total) ? "refunded" : "partially_refunded",
      },
    });
    await addOrderEvent(
      tx,
      orderId,
      {
        kind: "refunded",
        message: `Refunded ${formatCurrency(amount, order.currency)}${method === "razorpay" ? " to the original payment method" : " (paid back manually)"}${
          input.reason ? ` — ${input.reason.trim()}` : ""
        }${input.restock && items.length ? " · items restocked" : ""}`,
        actorName,
        meta: { refundId: created.id, razorpayRefundId, status },
      },
      { strict: true }
    );
    return created;
  });

  // Unshipped items that were refunded no longer need shipping.
  const { refreshFulfillmentStatus } = require("./operations");
  await refreshFulfillmentStatus(prisma, orderId);
  await syncOrderCommission(prisma, orderId);

  if (input.notify !== false) {
    await notify.sendRefund(prisma, store, await loadOrder(prisma, store.id, orderId), refund, log);
  }
  return refund;
}

module.exports = { createRefund };
