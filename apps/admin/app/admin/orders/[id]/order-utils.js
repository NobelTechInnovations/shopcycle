/** Shared helpers for the order page and its dialogs. */

export function dateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function dateOnly(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * What refunding these items is worth, as the shopper paid for them: the
 * items' price, less their share of any order discount, plus their share
 * of tax. The merchant can change it — this is only the starting figure.
 */
export function suggestedRefund(order, selection) {
  const byId = Object.fromEntries(order.items.map((i) => [i.id, i]));
  const itemsValue = selection.reduce((sum, s) => sum + Number(byId[s.orderItemId]?.price || 0) * s.quantity, 0);
  const subtotal = Number(order.subtotal) || 0;
  const discount = Number(order.discount) || 0;
  const taxable = Math.max(subtotal - discount, 0);
  const discountRatio = subtotal > 0 ? discount / subtotal : 0;
  const taxRatio = taxable > 0 ? Number(order.tax || 0) / taxable : 0;
  return round2(itemsValue * (1 - discountRatio) * (1 + taxRatio));
}

export const CANCEL_REASONS = [
  "Customer changed their mind",
  "Out of stock",
  "Customer unreachable",
  "Suspected fraud",
  "Payment not received",
  "Other",
];
