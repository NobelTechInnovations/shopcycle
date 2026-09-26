const { HttpError, formatCurrency } = require("@shopcycle/utils");
const { adjustStock } = require("../../lib/inventory");
const { syncOrderCommission } = require("../billing/commission");
const { addOrderEvent } = require("./events");
const { itemQuantities, deriveFulfillmentStatus, checkSelection } = require("./quantities");
const { trackingUrlFor } = require("./couriers");
const notify = require("./notify");
const giftCards = require("../gift-cards/service");

/**
 * What a merchant does with an order after it's placed: ship it (all at
 * once or in parts), mark shipments delivered, cancel it, record cash on
 * delivery as collected, and leave notes. Refunds and returns live in
 * refunds.js / returns.js; the GST invoice in invoice.js.
 */

const FULL_INCLUDE = {
  customer: true,
  items: { include: { product: { select: { hsnCode: true } } } },
  fulfillments: { orderBy: { createdAt: "asc" } },
  refunds: { orderBy: { createdAt: "asc" } },
  returns: { orderBy: { createdAt: "desc" } },
  events: { orderBy: { createdAt: "desc" }, take: 100 },
};

async function loadOrder(prisma, storeId, id) {
  const order = await prisma.order.findFirst({ where: { id, storeId }, include: FULL_INCLUDE });
  if (!order) throw new HttpError(404, "Order not found");
  return order;
}

/** Re-derives the order's fulfillment status from its shipments and saves it. */
async function refreshFulfillmentStatus(db, orderId) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, fulfillments: true, refunds: true } });
  const status = deriveFulfillmentStatus(order, itemQuantities(order));
  if (status !== order.fulfillmentStatus) {
    await db.order.update({ where: { id: orderId }, data: { fulfillmentStatus: status } });
  }
  return status;
}

function describeItems(order, selection) {
  const byId = Object.fromEntries(order.items.map((i) => [i.id, i]));
  const total = selection.reduce((n, s) => n + s.quantity, 0);
  if (selection.length === 1) return `${selection[0].quantity} × ${byId[selection[0].orderItemId]?.title}`;
  return `${total} items`;
}

async function createFulfillment(prisma, store, orderId, input, { actorName, log } = {}) {
  const order = await loadOrder(prisma, store.id, orderId);
  if (order.cancelledAt) throw new HttpError(400, "This order was cancelled.");

  const quantities = itemQuantities(order);
  const requested = input.items?.length
    ? input.items
    : order.items.map((i) => ({ orderItemId: i.id, quantity: quantities[i.id].toFulfill }));
  const items = checkSelection(order, requested, "toFulfill", "ship");
  if (!items.length) throw new HttpError(400, "There's nothing left to ship on this order.");

  const courier = input.courier?.trim() || null;
  const trackingNumber = input.trackingNumber?.trim() || null;
  const fulfillment = await prisma.$transaction(async (tx) => {
    const created = await tx.fulfillment.create({
      data: {
        orderId,
        storeId: store.id,
        courier,
        trackingNumber,
        trackingUrl: trackingUrlFor({ courier, trackingNumber, trackingUrl: input.trackingUrl?.trim() }),
        items,
      },
    });
    const status = await refreshFulfillmentStatus(tx, orderId);
    await addOrderEvent(
      tx,
      orderId,
      {
        kind: "fulfilled",
        message: `${status === "fulfilled" && items.length === order.items.length ? "Order" : describeItems(order, items)} shipped${
          courier ? ` via ${courier}` : ""
        }${trackingNumber ? ` · tracking ${trackingNumber}` : ""}`,
        actorName,
        meta: { fulfillmentId: created.id },
      },
      { strict: true }
    );
    return created;
  });

  // Shipping is the moment of supply for GST — issue the invoice now if
  // the store's plan includes GST invoicing. Never blocks the shipment.
  if (store.plan?.hasGstSoftware) {
    const { issueInvoice } = require("./invoice");
    await issueInvoice(prisma, store, order).catch((err) => log?.warn({ err }, "invoice: could not issue on fulfillment"));
  }

  if (input.notify !== false) {
    const fresh = await loadOrder(prisma, store.id, orderId);
    await notify.sendShippingUpdate(prisma, store, fresh, fulfillment, log);
  }
  return fulfillment;
}

async function updateFulfillment(prisma, store, orderId, fulfillmentId, action, { actorName, notify: send = true, log } = {}) {
  const order = await loadOrder(prisma, store.id, orderId);
  const fulfillment = order.fulfillments.find((f) => f.id === fulfillmentId);
  if (!fulfillment) throw new HttpError(404, "Shipment not found");

  if (action === "delivered") {
    if (fulfillment.status === "cancelled") throw new HttpError(400, "This shipment was cancelled.");
    if (fulfillment.status === "delivered") return fulfillment;
    const updated = await prisma.fulfillment.update({
      where: { id: fulfillmentId },
      data: { status: "delivered", deliveredAt: new Date() },
    });
    await addOrderEvent(prisma, orderId, { kind: "delivered", message: "Shipment delivered", actorName, meta: { fulfillmentId } });
    if (send) await notify.sendDelivered(prisma, store, order, log);
    return updated;
  }

  if (action === "cancel") {
    if (fulfillment.status === "cancelled") return fulfillment;
    if (fulfillment.status === "delivered") throw new HttpError(400, "A delivered shipment can't be cancelled — start a return instead.");
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.fulfillment.update({ where: { id: fulfillmentId }, data: { status: "cancelled" } });
      await refreshFulfillmentStatus(tx, orderId);
      await addOrderEvent(tx, orderId, { kind: "fulfilled", message: "Shipment cancelled — items are back to unshipped", actorName, meta: { fulfillmentId } }, { strict: true });
      return row;
    });
    return updated;
  }

  throw new HttpError(400, "Unknown shipment action");
}

/** Cash on delivery collected (or a manual order paid). Online orders
 * become paid only through a verified Razorpay payment. */
async function markPaid(prisma, store, orderId, { actorName } = {}) {
  const order = await loadOrder(prisma, store.id, orderId);
  if (order.paymentStatus !== "pending") throw new HttpError(400, "This order isn't awaiting payment.");
  if (order.cancelledAt) throw new HttpError(400, "This order was cancelled.");
  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "paid" } }),
    prisma.orderEvent.create({
      data: {
        orderId,
        kind: "paid",
        message: order.paymentMethod === "cod" ? "Cash on delivery collected — marked as paid" : "Marked as paid",
        actorName,
      },
    }),
  ]);
  await syncOrderCommission(prisma, orderId);
}

/**
 * Cancels an order that hasn't shipped: puts unshipped stock back, refunds
 * what was paid (back through Razorpay for online payments), and tells the
 * shopper. A shipped order can't be cancelled — cancel the shipment first,
 * or handle it as a return.
 */
async function cancelOrder(prisma, store, orderId, { reason, restock = true, refund = true, notify: send = true }, { actorName, log } = {}) {
  const order = await loadOrder(prisma, store.id, orderId);
  if (order.cancelledAt) throw new HttpError(400, "This order is already cancelled.");
  if (order.fulfillments.some((f) => f.status !== "cancelled")) {
    throw new HttpError(400, "This order has shipped items. Cancel the shipment first, or start a return.");
  }

  const quantities = itemQuantities(order);
  const paid = ["paid", "partially_refunded"].includes(order.paymentStatus);
  const cardBack = order.giftCardId ? await giftCards.refundableToCard(prisma, order) : 0;
  await prisma.$transaction(async (tx) => {
    if (restock) {
      for (const item of order.items) {
        const qty = quantities[item.id].toFulfill;
        if (item.variantId && qty > 0) {
          await adjustStock(tx, { storeId: store.id, variantId: item.variantId, delta: qty, reason: "order_cancelled", orderId, actorName });
        }
      }
    }
    await tx.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: "cancelled", cancelledAt: new Date(), cancelReason: reason || null },
    });
    // An unpaid order (cash on delivery, or an online payment that never
    // finished) still spent its gift card at checkout — put that back.
    // A paid order gets it back through the refund below instead.
    if (!paid && cardBack > 0) {
      await giftCards.creditBack(tx, order.giftCardId, orderId, cardBack, { actorName, note: `Order #${order.orderNumber} cancelled` });
    }
    await addOrderEvent(
      tx,
      orderId,
      {
        kind: "cancelled",
        message: `Order cancelled${reason ? ` — ${reason}` : ""}${restock ? " · items restocked" : ""}${
          !paid && cardBack > 0 ? ` · ${formatCurrency(cardBack, order.currency)} returned to the gift card` : ""
        }`,
        actorName,
      },
      { strict: true }
    );
  });

  const outstanding = Number(order.total) - Number(order.refundedAmount);
  if (refund && paid && outstanding > 0) {
    const { createRefund } = require("./refunds");
    await createRefund(
      prisma,
      store,
      orderId,
      { amount: outstanding, reason: reason || "Order cancelled", notify: false, allowCancelled: true },
      { actorName, log }
    );
  }
  await syncOrderCommission(prisma, orderId);

  if (send) await notify.sendCancelled(prisma, store, await loadOrder(prisma, store.id, orderId), reason, log);
}

async function addNote(prisma, store, orderId, text, { actorName } = {}) {
  await loadOrder(prisma, store.id, orderId);
  const note = String(text || "").trim();
  if (!note) throw new HttpError(400, "Write something first.");
  return addOrderEvent(prisma, orderId, { kind: "note", message: note.slice(0, 2000), actorName }, { strict: true });
}

module.exports = {
  FULL_INCLUDE,
  loadOrder,
  refreshFulfillmentStatus,
  createFulfillment,
  updateFulfillment,
  markPaid,
  cancelOrder,
  addNote,
};
