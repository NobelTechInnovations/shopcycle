/**
 * What a store may do right now, from its subscription — the one place
 * this is decided. The dashboard, the storefront and checkout each have
 * their own answer:
 *
 *   TRIALING (trial running)            dashboard ✓  storefront ✓
 *   TRIALING (trial over, no payment)   dashboard ✗  storefront ✓   (engine → PENDING_PAYMENT)
 *   PENDING_PAYMENT                     dashboard ✗  storefront ✓
 *   ACTIVE · CANCEL_SCHEDULED           dashboard ✓  storefront ✓
 *   GRACE_PERIOD (7 days after a fail)  dashboard ✓  storefront ✓
 *   PAST_DUE (grace over)               dashboard ✗  storefront ✓
 *   EXPIRED (inside its grace)          dashboard ✓  storefront ✓
 *   EXPIRED (grace over)                dashboard ✗  storefront ✓
 *   SUSPENDED (3 unpaid cycles)         dashboard ✗  storefront ✗  checkout ✗
 *   CANCELLED                           dashboard ✗  storefront ✗
 *
 * An admin grant (accessGrantedUntil) opens everything until it ends. A
 * store the platform suspended by hand (Store.status) is offline too.
 * Timestamps are also checked here, so access is right even before the
 * engine's next run catches up.
 */
const LEGACY = {
  // What older clients read as `accessState`.
  full: "ok",
  pending_payment: "needs_plan",
  locked: "admin_blocked",
  offline: "storefront_blocked",
};

function computeAccess(sub, { now = new Date(), storeStatus = "active", mandateActive = false } = {}) {
  const t = now.getTime();
  const past = (d) => d && new Date(d).getTime() <= t;
  const grant = sub?.accessGrantedUntil && new Date(sub.accessGrantedUntil).getTime() > t;

  let dashboard = true;
  let storefront = true;
  let reason = "ok";

  if (!sub) {
    // Not migrated yet — never lock a store out for our own gap.
    reason = "ok";
  } else {
    switch (sub.status) {
      case "TRIALING":
        if (past(sub.trialEndsAt) && !mandateActive) {
          dashboard = false;
          reason = "pending_payment";
        } else reason = "trial";
        break;
      case "PENDING_PAYMENT":
        dashboard = false;
        reason = "pending_payment";
        break;
      case "ACTIVE":
      case "CANCEL_SCHEDULED":
        reason = sub.status === "ACTIVE" ? "ok" : "cancel_scheduled";
        break;
      case "GRACE_PERIOD":
        if (past(sub.graceEndsAt)) {
          dashboard = false;
          reason = "locked";
        } else reason = "grace";
        break;
      case "PAST_DUE":
        dashboard = false;
        reason = "locked";
        break;
      case "EXPIRED":
        if (sub.lockedAt || past(sub.graceEndsAt)) {
          dashboard = false;
          reason = "locked";
        } else reason = "expired_grace";
        break;
      case "SUSPENDED":
      case "CANCELLED":
        dashboard = false;
        storefront = false;
        reason = sub.status === "SUSPENDED" ? "suspended" : "cancelled";
        break;
      default:
        break;
    }
  }

  if (grant) {
    dashboard = true;
    storefront = true;
    reason = "granted";
  }
  if (storeStatus === "suspended") {
    dashboard = false;
    storefront = false;
    reason = "store_suspended";
  }

  const legacyKey = storefront ? (dashboard ? "full" : reason === "pending_payment" ? "pending_payment" : "locked") : "offline";
  return { dashboard, storefront, checkout: storefront, reason, accessState: LEGACY[legacyKey] };
}

/** Old names, still imported in a few places. */
const isAdminBlocked = (accessState) => ["needs_plan", "admin_blocked", "storefront_blocked"].includes(accessState);
const isStorefrontBlocked = (accessState) => accessState === "storefront_blocked";

module.exports = { computeAccess, isAdminBlocked, isStorefrontBlocked };
