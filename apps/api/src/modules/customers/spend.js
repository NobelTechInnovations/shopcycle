/** What a customer has actually spent: paid orders that weren't cancelled,
 * less anything refunded. Pending (unpaid COD / abandoned online) and
 * fully refunded orders count for nothing.
 * Orders passed in need `total`, `refundedAmount`, `paymentStatus` and
 * `fulfillmentStatus`. */
function countsTowardSpend(o) {
  return ["paid", "partially_refunded"].includes(o.paymentStatus) && o.fulfillmentStatus !== "cancelled";
}

function amountSpent(orders) {
  return orders
    .filter(countsTowardSpend)
    .reduce((sum, o) => sum + Number(o.total) - Number(o.refundedAmount || 0), 0);
}

const SPEND_ORDER_SELECT = { id: true, total: true, refundedAmount: true, paymentStatus: true, fulfillmentStatus: true };

module.exports = { amountSpent, countsTowardSpend, SPEND_ORDER_SELECT };
