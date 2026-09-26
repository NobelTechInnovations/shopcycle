const { HttpError } = require("@shopcycle/utils");
const { adjustStock } = require("../../lib/inventory");
const { razorpayConfigured, razorpayRequest } = require("../billing/razorpay");
const { syncOrderCommission } = require("../billing/commission");
const { formatCurrency } = require("@shopcycle/utils");
const { addOrderEvent } = require("./events");
const { checkSelection, itemQuantities, round2 } = require("./quantities");
const notify = require("./notify");
const giftCards = require("../gift-cards/service");

function refundDestination({ toCard, toPayment, method, currency }) {
  const payment = method === "razorpay" ? "to the original payment method" : "paid back manually";
  if (toCard > 0 && toPayment > 0) return ` · ${formatCurrency(toCard, currency)} to the gift card, ${formatCurrency(toPayment, currency)} ${payment}`;
  if (toCard > 0) return " to the gift card";
  return method === "razorpay" ? ` ${payment}` : ` (${payment})`;
}

/**
 * Gives money back — for some items, an amount, or both.
 *
 *   Online (Razorpay) payments → refunded through Razorpay, back to the
 *     shopper's card/UPI/bank. If Razorpay refuses, nothing is recorded.
 *   Cash on delivery / manual → recorded as a manual refund; the merchant
 *     pays the shopper back themselves.
 *
 *   Paid partly with a gift card → that part goes back onto the card first,
 *     and only the rest to the payment method above.
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

  // The gift card part of the payment goes back onto the card first.
  const toCard = order.giftCardId ? round2(Math.min(amount, await giftCards.refundableToCard(prisma, order))) : 0;
  const toPayment = round2(amount - toCard);
  const card = toCard > 0 ? await prisma.giftCard.findUnique({ where: { id: order.giftCardId }, select: { last4: true } }) : null;

  // Money first: if the gateway says no, nothing else happens.
  let method = "manual";
  let razorpayRefundId = null;
  let status = "processed";
  if (toPayment > 0 && order.paymentMethod === "razorpay" && order.razorpayPaymentId) {
    if (!razorpayConfigured()) throw new HttpError(400, "Online refunds need Razorpay keys on this platform.");
    const rz = await razorpayRequest(`/payments/${encodeURIComponent(order.razorpayPaymentId)}/refund`, {
      method: "POST",
      body: { amount: Math.round(toPayment * 100), notes: { orderId: order.id, orderNumber: String(order.orderNumber) } },
    });
    method = "razorpay";
    razorpayRefundId = rz.id || null;
    status = rz.status === "failed" ? "failed" : rz.status === "processed" ? "processed" : "pending";
    if (status === "failed") throw new HttpError(502, "Razorpay couldn't process this refund. Try again, or refund the shopper manually.");
  }

  const quantities = itemQuantities(order);
  const refund = await prisma.$transaction(async (tx) => {
    const base = { orderId, storeId: store.id, reason: input.reason?.trim() || null, items, restocked: Boolean(input.restock && items.length) };
    // One Refund row per destination, so each shows how it was paid back.
    let created = null;
    if (toCard > 0) {
      await giftCards.creditBack(tx, order.giftCardId, orderId, toCard, { actorName, note: `Refund on order #${order.orderNumber}` });
      created = await tx.refund.create({ data: { ...base, amount: toCard, method: "gift_card", status: "processed" } });
    }
    if (toPayment > 0) {
      created = await tx.refund.create({ data: { ...base, amount: toPayment, method, razorpayRefundId, status } });
    }
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
        message: `Refunded ${formatCurrency(amount, order.currency)}${refundDestination({ toCard, toPayment, method, currency: order.currency })}${
          input.reason ? ` — ${input.reason.trim()}` : ""
        }${input.restock && items.length ? " · items restocked" : ""}`,
        actorName,
        meta: { refundId: created.id, razorpayRefundId, status, toGiftCard: toCard },
      },
      { strict: true }
    );
    // What the shopper's email describes: the whole amount, and where it went.
    return { ...created, amount, method: toPayment > 0 ? method : "gift_card", toGiftCard: toCard, giftCardLast4: card?.last4 || null };
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
