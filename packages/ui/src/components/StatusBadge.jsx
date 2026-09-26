"use client";

// One fixed status → tone mapping everywhere in the admin: green means
// active/paid/live, amber means waiting on someone (pending/draft/
// unfulfilled), red means stopped or reversed, grey means inert. A merchant
// never has to re-learn what a colour means on a different page.
const STATUS_MAP = {
  active: { tone: "success", label: "Active" },
  paid: { tone: "success", label: "Paid" },
  live: { tone: "success", label: "Live" },
  fulfilled: { tone: "success", label: "Fulfilled" },
  published: { tone: "success", label: "Published" },
  enabled: { tone: "success", label: "Enabled" },
  installed: { tone: "neutral", label: "Installed" },
  pending: { tone: "warning", label: "Pending" },
  draft: { tone: "warning", label: "Draft" },
  unfulfilled: { tone: "warning", label: "Unfulfilled" },
  partially_fulfilled: { tone: "warning", label: "Partially fulfilled" },
  partially_refunded: { tone: "warning", label: "Partially refunded" },
  // Shipments and returns
  shipped: { tone: "info", label: "Shipped" },
  delivered: { tone: "success", label: "Delivered" },
  requested: { tone: "warning", label: "Return requested" },
  approved: { tone: "info", label: "Approved" },
  received: { tone: "info", label: "Received" },
  declined: { tone: "neutral", label: "Declined" },
  closed: { tone: "neutral", label: "Closed" },
  processed: { tone: "success", label: "Processed" },
  // Emails
  sent: { tone: "success", label: "Sent" },
  logged: { tone: "info", label: "Kept locally" },
  scheduled: { tone: "info", label: "Scheduled" },
  cancelled: { tone: "danger", label: "Cancelled" },
  refunded: { tone: "danger", label: "Refunded" },
  failed: { tone: "danger", label: "Failed" },
  expired: { tone: "neutral", label: "Expired" },
  archived: { tone: "neutral", label: "Archived" },
  hidden: { tone: "neutral", label: "Hidden" },
  disabled: { tone: "neutral", label: "Disabled" },
  suspended: { tone: "danger", label: "Suspended" },
};

const TONES = {
  success: { bg: "#E8F6EE", fg: "#15703A", dot: "#16A34A" },
  warning: { bg: "#FEF3E2", fg: "#8A4B0B", dot: "#D97706" },
  danger: { bg: "#FDECEC", fg: "#A11B1B", dot: "#DC2626" },
  info: { bg: "#EAF0FE", fg: "#1D4ED8", dot: "#2563EB" },
  neutral: { bg: "#F1F1F3", fg: "#52525B", dot: "#9A9AA5" },
};

function humanize(status) {
  return String(status || "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** A soft pill with a status dot. `tone` overrides the mapping for a
 * one-off status; `label` overrides the text. */
export function StatusBadge({ status, label, tone }) {
  const entry = STATUS_MAP[status] || { tone: "neutral", label: humanize(status) };
  const t = TONES[tone || entry.tone] || TONES.neutral;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium leading-5 whitespace-nowrap"
      style={{ background: t.bg, color: t.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.dot }} aria-hidden="true" />
      {label || entry.label}
    </span>
  );
}
