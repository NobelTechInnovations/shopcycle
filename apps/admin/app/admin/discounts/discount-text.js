import { Percent, ShoppingBag, Gift, Truck } from "lucide-react";
import { formatCurrency } from "@shopcycle/utils";

/** The four kinds, as the "Create discount" picker shows them. */
export const DISCOUNT_TYPES = [
  { key: "order", icon: ShoppingBag, title: "Amount off order", text: "A percentage or fixed amount off the whole order — the classic code." },
  { key: "products", icon: Percent, title: "Amount off products", text: "Off chosen products or collections only — a sale on one range." },
  { key: "bxgy", icon: Gift, title: "Buy X get Y", text: "Buy 2 get 1 free, or buy 3 get one at 50% off." },
  { key: "shipping", icon: Truck, title: "Free shipping", text: "Free delivery, with or without a minimum order." },
];

/** Which picker kind a saved discount is. */
export function kindOf(d) {
  if (d.type === "free_shipping") return "shipping";
  if (d.type === "buy_x_get_y") return "bxgy";
  return d.appliesTo && d.appliesTo !== "order" ? "products" : "order";
}

export function TYPE_INFO(d) {
  const k = DISCOUNT_TYPES.find((t) => t.key === kindOf(d));
  return { icon: k.icon, label: k.title };
}

const n = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/** The discount in plain words — the list's second line and the form's summary. */
export function summaryLines(d, { collections = [], products = [] } = {}) {
  const lines = [];
  const targets =
    d.appliesTo === "collections"
      ? `${(d.targetIds || []).length} collection${(d.targetIds || []).length === 1 ? "" : "s"}`
      : d.appliesTo === "products"
        ? `${(d.targetIds || []).length} product${(d.targetIds || []).length === 1 ? "" : "s"}`
        : "the whole order";
  const named = (ids, list) => ids.map((id) => list.find((x) => x.id === id)?.title).filter(Boolean);
  const targetNames = d.appliesTo === "collections" ? named(d.targetIds || [], collections) : d.appliesTo === "products" ? named(d.targetIds || [], products) : [];
  const on = targetNames.length ? targetNames.slice(0, 3).join(", ") + (targetNames.length > 3 ? ` +${targetNames.length - 3}` : "") : targets;
  if (d.type === "free_shipping") lines.push("Free shipping");
  else if (d.type === "buy_x_get_y") lines.push(`Buy ${d.buyQuantity || "?"}, get ${d.getQuantity || "?"} ${n(d.value) >= 100 ? "free" : `at ${n(d.value) || 0}% off`}${d.appliesTo !== "order" ? ` · ${on}` : ""}`);
  else if (d.type === "percentage") lines.push(`${n(d.value) || 0}% off ${on}${n(d.maxDiscount) ? ` (up to ${formatCurrency(n(d.maxDiscount))})` : ""}`);
  else lines.push(`${formatCurrency(n(d.value) || 0)} off ${on}`);
  if (n(d.minSubtotal)) lines.push(`Orders over ${formatCurrency(n(d.minSubtotal))}`);
  if (n(d.minQuantity)) lines.push(`At least ${n(d.minQuantity)} item${n(d.minQuantity) === 1 ? "" : "s"}`);
  if (d.oncePerCustomer) lines.push("Once per customer");
  if (n(d.usageLimit)) lines.push(`${n(d.usageLimit)} uses in total`);
  return lines;
}
