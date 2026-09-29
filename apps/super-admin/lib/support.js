export const TICKET_STATUS = {
  open: { label: "Needs reply", tone: "warning" },
  waiting: { label: "Waiting on seller", tone: "info" },
  resolved: { label: "Solved", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

export const PRIORITY_COLOR = { low: "default", normal: "blue", high: "orange", urgent: "red" };

export function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
