const { HttpError } = require("@shopcycle/utils");
const repository = require("./repository");
const { syncOrderCommission } = require("../billing/commission");
const { adjustStock } = require("../../lib/inventory");
const { addOrderEvent } = require("./events");
const operations = require("./operations");
const { createRefund } = require("./refunds");
const { itemQuantities } = require("./quantities");
const { returnDeadline } = require("./returns");

function computeTotals(items, { discount = 0, shipping = 0, tax = 0 }) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const total = subtotal - discount + shipping + tax;
  return { subtotal, total };
}

async function listOrders(prisma, storeId, query) {
  const [orders, total] = await repository.list(prisma, storeId, query);
  return { orders, total, page: query.page, pageSize: query.pageSize };
}

/** The order page's data: the order with its shipments, refunds, returns
 * and timeline, plus what's left to ship / refund / return per item. */
async function getOrder(prisma, store, id) {
  const order = await operations.loadOrder(prisma, store.id, id);
  const deadline = returnDeadline(store, order);
  return {
    ...order,
    quantities: itemQuantities(order),
    refundable: Math.max(Number(order.total) - Number(order.refundedAmount), 0),
    returnDeadline: deadline,
  };
}

async function createOrder(prisma, storeId, input, { actorName } = {}) {
  const { items, ...rest } = input;
  const { subtotal, total } = computeTotals(items, rest);
  const items_ = items.map((item) => ({ ...item, total: item.quantity * item.price }));

  const order = await repository.withNextOrderNumber(prisma, storeId, (orderNumber) =>
    prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: { ...rest, subtotal, total, storeId, orderNumber, items: { create: items_ } },
        include: { customer: true, items: true },
      });
      for (const item of created.items) {
        if (item.variantId) {
          await adjustStock(tx, { storeId, variantId: item.variantId, delta: -item.quantity, reason: "sold", orderId: created.id, actorName });
        }
      }
      await addOrderEvent(tx, created.id, { kind: "placed", message: "Order created in the admin", actorName }, { strict: true });
      return created;
    })
  );
  // A manual order created as already paid earns commission like any other.
  await syncOrderCommission(prisma, order.id);
  return order;
}

/**
 * The older one-dropdown status API, kept for existing callers. Each
 * change now runs the real action behind it, so stock, refunds, emails and
 * the timeline stay right:
 *   paymentStatus "paid"            → mark as paid (COD collected)
 *   paymentStatus "refunded"        → refund whatever is left (no email)
 *   fulfillmentStatus "fulfilled"   → ship everything left (no email)
 *   fulfillmentStatus "cancelled"   → cancel, restock, refund what was paid
 */
async function updateOrderStatus(prisma, store, id, input, ctx = {}) {
  const order = await operations.loadOrder(prisma, store.id, id);
  if (input.paymentStatus && input.paymentStatus !== order.paymentStatus) {
    if (input.paymentStatus === "paid") {
      await operations.markPaid(prisma, store, id, ctx);
    } else if (input.paymentStatus === "refunded") {
      const left = Number(order.total) - Number(order.refundedAmount);
      await createRefund(prisma, store, id, { amount: left, reason: "Refunded", notify: false }, ctx);
    } else {
      throw new HttpError(400, "A paid order can't go back to pending.");
    }
  }
  if (input.fulfillmentStatus && input.fulfillmentStatus !== order.fulfillmentStatus) {
    if (input.fulfillmentStatus === "cancelled") {
      await operations.cancelOrder(prisma, store, id, { notify: false }, ctx);
    } else if (input.fulfillmentStatus === "fulfilled") {
      await operations.createFulfillment(prisma, store, id, { notify: false }, ctx);
    } else {
      throw new HttpError(400, "To undo a shipment, cancel it from the order page.");
    }
  }
  return repository.findById(prisma, store.id, id);
}

module.exports = { listOrders, getOrder, createOrder, updateOrderStatus };
