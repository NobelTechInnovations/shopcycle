const { HttpError } = require("@shopcycle/utils");

/**
 * Per line item: how many were ordered, shipped (in live fulfillments),
 * refunded, and are still waiting to ship. Everything that changes an
 * order's items (fulfilling, refunding, returning) checks against this, so
 * nothing can be shipped twice or refunded beyond what was bought.
 *
 * Refunding an unshipped item removes it from what's left to ship; a
 * refund on a shipped item (a return) doesn't bring anything back.
 */
function sumBy(list, field = "quantity") {
  return (list || []).reduce((acc, row) => {
    acc[row.orderItemId] = (acc[row.orderItemId] || 0) + Number(row[field] || 0);
    return acc;
  }, {});
}

function itemQuantities(order) {
  const shipped = sumBy((order.fulfillments || []).filter((f) => f.status !== "cancelled").flatMap((f) => f.items || []));
  const refunded = sumBy((order.refunds || []).flatMap((r) => r.items || []));
  const returned = sumBy((order.returns || []).filter((r) => r.status !== "declined").flatMap((r) => r.items || []));

  // Orders marked "fulfilled" with the old status dropdown have no
  // shipment records — they did ship, so count everything as shipped
  // rather than offering to ship them again.
  const legacyShipped = order.fulfillmentStatus === "fulfilled" && (order.fulfillments || []).length === 0;

  const byItem = {};
  for (const item of order.items || []) {
    const ordered = item.quantity;
    const fulfilled = legacyShipped ? ordered : Math.min(shipped[item.id] || 0, ordered);
    const refundedQty = Math.min(refunded[item.id] || 0, ordered);
    // Refunds use up unshipped units first; any beyond that were shipped
    // units refunded without a return — they're effectively back too. A
    // return that was then refunded counts once, hence max() not sum.
    const refundedShipped = Math.max(refundedQty - (ordered - fulfilled), 0);
    const back = Math.max(returned[item.id] || 0, refundedShipped);
    byItem[item.id] = {
      ordered,
      fulfilled,
      refunded: refundedQty,
      returned: returned[item.id] || 0,
      toFulfill: Math.max(ordered - fulfilled - refundedQty, 0),
      refundable: Math.max(ordered - refundedQty, 0),
      returnable: Math.max(fulfilled - back, 0),
    };
  }
  return byItem;
}

/** The order-level fulfillment status its shipments add up to. */
function deriveFulfillmentStatus(order, quantities = itemQuantities(order)) {
  if (order.cancelledAt) return "cancelled";
  const rows = Object.values(quantities);
  const shipped = rows.reduce((n, q) => n + q.fulfilled, 0);
  const waiting = rows.reduce((n, q) => n + q.toFulfill, 0);
  if (shipped === 0) return "unfulfilled";
  return waiting === 0 ? "fulfilled" : "partially_fulfilled";
}

/** Validates a [{ orderItemId, quantity }] selection against a limit per
 * item (e.g. toFulfill) and drops zero rows. */
function checkSelection(order, selection, limitField, verb) {
  const quantities = itemQuantities(order);
  const clean = [];
  for (const row of selection || []) {
    const qty = Math.trunc(Number(row.quantity));
    if (!qty) continue;
    const q = quantities[row.orderItemId];
    if (!q) throw new HttpError(400, "That item isn't part of this order.");
    if (qty < 0 || qty > q[limitField]) {
      const item = order.items.find((i) => i.id === row.orderItemId);
      throw new HttpError(400, `You can ${verb} at most ${q[limitField]} of "${item.title}".`);
    }
    clean.push({ orderItemId: row.orderItemId, quantity: qty });
  }
  return clean;
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

module.exports = { itemQuantities, deriveFulfillmentStatus, checkSelection, round2 };
