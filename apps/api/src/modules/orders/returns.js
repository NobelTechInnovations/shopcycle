const { HttpError } = require("@shopcycle/utils");
const { adjustStock } = require("../../lib/inventory");
const { storeSettings } = require("../../lib/store-settings");
const { addOrderEvent } = require("./events");
const { checkSelection, itemQuantities } = require("./quantities");
const notify = require("./notify");

/**
 * Returns: requested by the shopper from their order page (within the
 * store's return window) or opened by the merchant, then
 *   requested → approved → received → closed        (or → declined)
 * Receiving a return can put the items back in stock; the money goes back
 * through a normal refund (refunds.js), linked to the return.
 */

const DAY = 24 * 60 * 60 * 1000;

/** When the return window closes: N days after the last delivery (or
 * shipment, if nothing has been marked delivered), per store setting. */
function returnDeadline(store, order) {
  const days = Number(storeSettings(store).returnWindowDays) || 0;
  if (days <= 0) return null;
  const shipped = (order.fulfillments || []).filter((f) => f.status !== "cancelled");
  if (!shipped.length) return null;
  const last = Math.max(...shipped.map((f) => new Date(f.deliveredAt || f.shippedAt).getTime()));
  return new Date(last + days * DAY);
}

/** Whether the shopper can ask for a return right now, and why not. */
function returnEligibility(store, order) {
  if (order.cancelledAt) return { eligible: false, reason: "This order was cancelled." };
  if ((order.returns || []).some((r) => ["requested", "approved"].includes(r.status))) {
    return { eligible: false, reason: "A return for this order is already in progress." };
  }
  const quantities = itemQuantities(order);
  if (!Object.values(quantities).some((q) => q.returnable > 0)) {
    return { eligible: false, reason: "There's nothing on this order that can be returned yet." };
  }
  const deadline = returnDeadline(store, order);
  if (!deadline) return { eligible: false, reason: "This store doesn't accept returns online — contact them directly." };
  if (deadline < new Date()) return { eligible: false, reason: "The return window for this order has closed.", deadline };
  return { eligible: true, deadline };
}

async function requestReturn(prisma, store, order, { items, reason, note }, { byShopper = true, actorName, log } = {}) {
  if (byShopper) {
    const { eligible, reason: why } = returnEligibility(store, order);
    if (!eligible) throw new HttpError(400, why);
  } else if (order.cancelledAt) {
    throw new HttpError(400, "This order was cancelled.");
  }
  const selection = checkSelection(order, items, "returnable", "return");
  if (!selection.length) throw new HttpError(400, "Choose at least one item to return.");

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.returnRequest.create({
      data: {
        orderId: order.id,
        storeId: store.id,
        status: byShopper ? "requested" : "approved",
        items: selection,
        reason: reason?.trim()?.slice(0, 200) || null,
        customerNote: note?.trim()?.slice(0, 2000) || null,
        requestedBy: byShopper ? "shopper" : "merchant",
      },
    });
    await addOrderEvent(
      tx,
      order.id,
      {
        kind: "return",
        message: byShopper
          ? `Customer requested a return${reason ? ` — ${reason.trim()}` : ""}`
          : `Return opened${reason ? ` — ${reason.trim()}` : ""}`,
        actorName: byShopper ? "Customer" : actorName,
        meta: { returnId: row.id },
      },
      { strict: true }
    );
    return row;
  });

  await notify.sendReturnUpdate(prisma, store, order, created, log);
  return created;
}

const TRANSITIONS = {
  approve: { from: ["requested"], to: "approved", message: "Return approved" },
  decline: { from: ["requested"], to: "declined", message: "Return declined" },
  receive: { from: ["approved"], to: "received", message: "Returned items received" },
  close: { from: ["received"], to: "closed", message: "Return closed" },
};

async function updateReturn(prisma, store, orderId, returnId, { action, merchantNote, restock = true, notify: send = true }, { actorName, log } = {}) {
  const { loadOrder } = require("./operations");
  const order = await loadOrder(prisma, store.id, orderId);
  const ret = order.returns.find((r) => r.id === returnId);
  if (!ret) throw new HttpError(404, "Return not found");
  const step = TRANSITIONS[action];
  if (!step) throw new HttpError(400, "Unknown return action");
  if (!step.from.includes(ret.status)) throw new HttpError(400, `This return is ${ret.status} — it can't be ${step.to} now.`);

  const updated = await prisma.$transaction(async (tx) => {
    if (action === "receive" && restock) {
      for (const row of ret.items || []) {
        const item = order.items.find((i) => i.id === row.orderItemId);
        if (item?.variantId && !item.properties?.rental) {
          await adjustStock(tx, { storeId: store.id, variantId: item.variantId, delta: row.quantity, reason: "returned", orderId, actorName });
        }
      }
    }
    const row = await tx.returnRequest.update({
      where: { id: returnId },
      data: { status: step.to, ...(merchantNote !== undefined && { merchantNote: merchantNote?.trim() || null }) },
    });
    await addOrderEvent(
      tx,
      orderId,
      {
        kind: "return",
        message: `${step.message}${action === "receive" && restock ? " · items restocked" : ""}${merchantNote ? ` — ${merchantNote.trim()}` : ""}`,
        actorName,
        meta: { returnId },
      },
      { strict: true }
    );
    return row;
  });

  if (send && ["approve", "decline", "receive"].includes(action)) {
    await notify.sendReturnUpdate(prisma, store, order, updated, log);
  }
  return updated;
}

/** Links a refund to the return it pays out, and closes the return. */
async function attachRefund(prisma, returnId, refundId) {
  return prisma.returnRequest.update({ where: { id: returnId }, data: { refundId, status: "closed" } });
}

module.exports = { returnDeadline, returnEligibility, requestReturn, updateReturn, attachRefund };
