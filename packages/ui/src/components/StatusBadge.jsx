"use client";

import { Tag } from "antd";

const STATUS_MAP = {
  active: { color: "success", label: "Active" },
  paid: { color: "success", label: "Paid" },
  live: { color: "success", label: "Live" },
  fulfilled: { color: "success", label: "Fulfilled" },
  installed: { color: "default", label: "Installed" },
  pending: { color: "warning", label: "Pending" },
  draft: { color: "warning", label: "Draft" },
  unfulfilled: { color: "warning", label: "Unfulfilled" },
  cancelled: { color: "error", label: "Cancelled" },
  refunded: { color: "error", label: "Refunded" },
  archived: { color: "default", label: "Archived" },
  suspended: { color: "error", label: "Suspended" },
};

/** Status colors follow one fixed mapping everywhere in the admin — green
 * means active/paid/live, orange means pending/draft, red means
 * cancelled/destructive, so a merchant never has to re-learn what a color
 * means on a different page. */
export function StatusBadge({ status, label }) {
  const entry = STATUS_MAP[status] || { color: "default", label: status };
  return <Tag color={entry.color}>{label || entry.label}</Tag>;
}
