import { formatCurrency } from "@shopcycle/utils";

/** Formatting shared by the platform's billing pages. */
export const inr = (n) => formatCurrency(Number(n || 0), "INR");

export const STATUS = {
  TRIALING: { status: "scheduled", label: "Trialing" },
  PENDING_PAYMENT: { status: "failed", label: "Pending payment" },
  ACTIVE: { status: "active", label: "Active" },
  PAST_DUE: { status: "failed", label: "Past due" },
  GRACE_PERIOD: { status: "pending", label: "Grace period" },
  CANCEL_SCHEDULED: { status: "pending", label: "Cancel scheduled" },
  CANCELLED: { status: "cancelled", label: "Cancelled" },
  SUSPENDED: { status: "suspended", label: "Suspended" },
  EXPIRED: { status: "expired", label: "Expired" },
};

export const STATUS_ORDER = ["TRIALING", "ACTIVE", "CANCEL_SCHEDULED", "GRACE_PERIOD", "PENDING_PAYMENT", "PAST_DUE", "SUSPENDED", "EXPIRED", "CANCELLED"];

export function day(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function dateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
