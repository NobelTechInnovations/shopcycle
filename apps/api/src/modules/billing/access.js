/**
 * Computes a store's current billing access state from timestamps alone —
 * no cron job, no background worker. This runs on every request that needs
 * it (see plugins/jwt-auth.js#loadStoreContext), which is cheap enough at
 * this scale and means the state is always exactly correct as of "right
 * now," never stale waiting on a scheduled job to catch up.
 *
 * States, in the order a store actually moves through them:
 *   ok                  — full access (still within the free grace period,
 *                         on an active plan, or trialing)
 *   needs_plan          — no_plan and the 2-day grace has passed: admin
 *                         blocked until a plan + mandate is set up
 *   admin_blocked       — a renewal failed 7+ days ago: admin blocked,
 *                         storefront still fully live
 *   storefront_blocked  — a renewal failed 15+ days ago: storefront blocked too
 *
 * `cancelled` behaves like storefront_blocked — there's no active
 * subscription to fall back to.
 */
const GRACE_DAYS_BEFORE_PLAN_REQUIRED = 2;
const DAYS_BEFORE_ADMIN_BLOCKED = 7;
const DAYS_BEFORE_STOREFRONT_BLOCKED = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(date) {
  return (Date.now() - new Date(date).getTime()) / DAY_MS;
}

function computeAccessState(store) {
  switch (store.subscriptionStatus) {
    case "no_plan": {
      if (store.mandateDeadline && Date.now() > new Date(store.mandateDeadline).getTime()) {
        return "needs_plan";
      }
      return "ok";
    }
    case "trialing":
    case "active":
      return "ok";
    case "past_due": {
      if (!store.paymentFailedAt) return "ok"; // shouldn't happen, but never block without a reason
      const days = daysSince(store.paymentFailedAt);
      if (days >= DAYS_BEFORE_STOREFRONT_BLOCKED) return "storefront_blocked";
      if (days >= DAYS_BEFORE_ADMIN_BLOCKED) return "admin_blocked";
      return "ok";
    }
    case "cancelled":
      return "storefront_blocked";
    default:
      return "ok";
  }
}

/** True once accessState means the seller admin should be locked out
 * (everything except the billing screens themselves). */
function isAdminBlocked(accessState) {
  return accessState === "needs_plan" || accessState === "admin_blocked" || accessState === "storefront_blocked";
}

/** True once the storefront itself should stop serving shoppers. */
function isStorefrontBlocked(accessState) {
  return accessState === "storefront_blocked";
}

module.exports = {
  GRACE_DAYS_BEFORE_PLAN_REQUIRED,
  DAYS_BEFORE_ADMIN_BLOCKED,
  DAYS_BEFORE_STOREFRONT_BLOCKED,
  computeAccessState,
  isAdminBlocked,
  isStorefrontBlocked,
};
