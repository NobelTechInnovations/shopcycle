/** What a gift card's badge says: disabled and expired win over balance. */
export function cardState(card) {
  if (card.status !== "active") return "disabled";
  if (card.expiresAt && new Date(card.expiresAt) < new Date()) return "expired";
  if (Number(card.balance) <= 0) return "used";
  return Number(card.balance) < Number(card.initialValue) ? "partially_used" : "active";
}

export const CARD_STATE_BADGE = {
  active: { status: "active", label: "Active" },
  partially_used: { status: "active", label: "Partly used" },
  used: { status: "archived", label: "Used up" },
  expired: { status: "expired", label: "Expired" },
  disabled: { status: "disabled", label: "Disabled" },
};

export const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
