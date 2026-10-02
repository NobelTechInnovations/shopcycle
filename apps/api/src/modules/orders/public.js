const { itemQuantities } = require("./quantities");
const { returnEligibility } = require("./returns");
const { esc } = require("../../emails/templates");

// Shopper-typed fields are escaped: Liquid prints values raw (see the
// note in storefront/service.js).
const safe = (v) => (v === null || v === undefined ? v : esc(v));

/** "26 Sept 2026" in the store's timezone — formatted here because
 * Liquid's date filter would use the server's zone (UTC in production). */
function dateLabel(store, d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: store.timezone || "Asia/Kolkata" });
}

/**
 * The shopper's view of an order — what the order status page and the
 * account page render. Built field by field on purpose: staff notes,
 * internal timeline entries, commission and payment ids never leave the
 * API this way.
 */

const RETURN_STATUS = {
  requested: "Return requested — awaiting review",
  approved: "Return approved",
  declined: "Return declined",
  received: "Returned items received",
  closed: "Return complete",
};

const STEP_LABELS = {
  placed: "Order placed",
  paid: "Payment confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
};

function statusSummary(order) {
  if (order.cancelledAt) return { key: "cancelled", label: "Cancelled" };
  const live = order.fulfillments.filter((f) => f.status !== "cancelled");
  if (live.length && live.every((f) => f.status === "delivered") && order.fulfillmentStatus === "fulfilled") {
    return { key: "delivered", label: "Delivered" };
  }
  if (order.fulfillmentStatus === "fulfilled") return { key: "shipped", label: "On its way" };
  if (order.fulfillmentStatus === "partially_fulfilled") return { key: "partially_shipped", label: "Partly shipped" };
  return { key: "processing", label: order.paymentStatus === "pending" && order.paymentMethod !== "cod" ? "Awaiting payment" : "Being prepared" };
}

function publicOrder(store, order, { statusUrl, invoiceUrl } = {}) {
  const quantities = itemQuantities(order);
  const live = order.fulfillments.filter((f) => f.status !== "cancelled");
  const lastDelivered = live.filter((f) => f.deliveredAt).map((f) => new Date(f.deliveredAt)).sort((a, b) => b - a)[0];
  const firstShipped = live.map((f) => new Date(f.shippedAt)).sort((a, b) => a - b)[0];
  const status = statusSummary(order);

  const steps = [
    { key: "placed", label: STEP_LABELS.placed, done: true, date: dateLabel(store, order.createdAt) },
    ...(order.paymentMethod !== "cod"
      ? [{ key: "paid", label: STEP_LABELS.paid, done: ["paid", "partially_refunded", "refunded"].includes(order.paymentStatus), date: null }]
      : []),
    {
      key: "shipped",
      label: STEP_LABELS.shipped,
      // (Orders shipped before shipments were recorded have no dates.)
      done: Boolean(firstShipped) || ["fulfilled", "partially_fulfilled"].includes(order.fulfillmentStatus),
      date: dateLabel(store, firstShipped),
    },
    {
      key: "delivered",
      label: STEP_LABELS.delivered,
      done: status.key === "delivered",
      date: status.key === "delivered" ? dateLabel(store, lastDelivered) : null,
    },
  ];

  const eligibility = returnEligibility(store, order);
  return {
    orderNumber: order.orderNumber,
    name: `#${order.orderNumber}`,
    createdAt: order.createdAt,
    date: dateLabel(store, order.createdAt),
    email: safe(order.email),
    status,
    cancelled: Boolean(order.cancelledAt),
    cancelReason: order.cancelReason,
    steps,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    currency: order.currency,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    discountCode: order.discountCode,
    shipping: Number(order.shipping),
    tax: Number(order.tax),
    total: Number(order.total),
    giftCardAmount: Number(order.giftCardAmount || 0),
    amountDue: Math.max(0, Number(order.total) - Number(order.giftCardAmount || 0)),
    refundedAmount: Number(order.refundedAmount),
    shippingName: safe(order.shippingName),
    shippingAddress1: safe(order.shippingAddress1),
    shippingAddress2: safe(order.shippingAddress2),
    shippingCity: safe(order.shippingCity),
    shippingProvince: safe(order.shippingProvince),
    shippingZip: safe(order.shippingZip),
    shippingCountry: safe(order.shippingCountry),
    items: order.items.map((i) => ({
      id: i.id,
      product_id: i.productId || null,
      title: i.title,
      quantity: i.quantity,
      price: Number(i.price),
      total: Number(i.total),
      returnable: quantities[i.id]?.returnable || 0,
      // e.g. a rental's dates — written by the platform, never by shoppers.
      detail: i.properties?.detail ? safe(i.properties.detail) : null,
    })),
    shipments: live.map((f) => ({
      status: f.status,
      courier: f.courier,
      trackingNumber: f.trackingNumber,
      trackingUrl: f.trackingUrl,
      shippedAt: f.shippedAt,
      deliveredAt: f.deliveredAt,
      shipped_on: dateLabel(store, f.shippedAt),
      delivered_on: dateLabel(store, f.deliveredAt),
      itemCount: (f.items || []).reduce((n, i) => n + i.quantity, 0),
    })),
    refunds: order.refunds.map((r) => ({ amount: Number(r.amount), date: dateLabel(store, r.createdAt), method: r.method })),
    returns: order.returns.map((r) => ({
      status: r.status,
      status_label: RETURN_STATUS[r.status] || r.status,
      date: dateLabel(store, r.createdAt),
      merchantNote: r.merchantNote,
    })),
    canReturn: eligibility.eligible,
    returnDeadline: dateLabel(store, eligibility.deadline),
    returnBlockedReason: eligibility.eligible ? null : eligibility.reason,
    statusUrl: statusUrl || null,
    invoiceUrl: order.invoiceNumber ? invoiceUrl || null : null,
    invoiceNumber: order.invoiceNumber,
  };
}

module.exports = { publicOrder, statusSummary };
