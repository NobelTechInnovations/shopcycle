const { HttpError } = require("@shopcycle/utils");

/**
 * Throws if adding one more of `resourceLabel` would exceed the store's
 * plan limit. `currentCount` is the count *before* the new one is added.
 * A store with no plan assigned (shouldn't happen after Phase 7's
 * register-time default, but defensive) is treated as unlimited rather
 * than blocking everything.
 */
function assertWithinPlanLimit(plan, currentCount, limitField, resourceLabel) {
  if (!plan) return;
  const limit = plan[limitField];
  if (limit != null && currentCount >= limit) {
    throw new HttpError(
      400,
      `Your ${plan.name} plan allows up to ${limit} ${resourceLabel}. Upgrade in Settings → Billing to add more.`
    );
  }
}

module.exports = { assertWithinPlanLimit };
