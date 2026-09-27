const { HttpError } = require("@shopcycle/utils");

/**
 * The subscription state machine. Status changes go through `transition`,
 * which checks the move is allowed and writes an immutable
 * SubscriptionEvent in the same transaction.
 *
 *   TRIALING ──paid──────────────► ACTIVE ◄──────────── paid (any unpaid state)
 *      │ trial ends unpaid             │ charge fails
 *      ▼                               ▼
 *   PENDING_PAYMENT (locked)      GRACE_PERIOD (7 days, full access)
 *      │                               │ grace over
 *      │                               ▼
 *      └──3 unpaid cycles──►     PAST_DUE (locked, store live) ──3 unpaid──► SUSPENDED (offline)
 *
 *   ACTIVE ──cancel──► CANCEL_SCHEDULED ──period ends──► EXPIRED (7-day grace, then locked)
 *   any ──admin──► CANCELLED
 */
const S = {
  TRIALING: "TRIALING",
  PENDING_PAYMENT: "PENDING_PAYMENT",
  ACTIVE: "ACTIVE",
  PAST_DUE: "PAST_DUE",
  GRACE_PERIOD: "GRACE_PERIOD",
  CANCEL_SCHEDULED: "CANCEL_SCHEDULED",
  CANCELLED: "CANCELLED",
  SUSPENDED: "SUSPENDED",
  EXPIRED: "EXPIRED",
};

const ALLOWED = {
  TRIALING: ["ACTIVE", "PENDING_PAYMENT", "GRACE_PERIOD", "CANCEL_SCHEDULED", "CANCELLED", "SUSPENDED", "TRIALING"],
  PENDING_PAYMENT: ["ACTIVE", "SUSPENDED", "CANCELLED", "TRIALING", "PENDING_PAYMENT"],
  ACTIVE: ["GRACE_PERIOD", "CANCEL_SCHEDULED", "CANCELLED", "SUSPENDED", "ACTIVE"],
  GRACE_PERIOD: ["ACTIVE", "PAST_DUE", "CANCELLED", "SUSPENDED", "GRACE_PERIOD"],
  PAST_DUE: ["ACTIVE", "SUSPENDED", "CANCELLED", "PAST_DUE"],
  CANCEL_SCHEDULED: ["ACTIVE", "TRIALING", "EXPIRED", "PENDING_PAYMENT", "CANCELLED", "SUSPENDED", "GRACE_PERIOD", "CANCEL_SCHEDULED"],
  EXPIRED: ["ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"],
  SUSPENDED: ["ACTIVE", "PAST_DUE", "CANCELLED", "TRIALING", "SUSPENDED"],
  CANCELLED: ["ACTIVE", "TRIALING", "CANCELLED"],
};

/** Records an event without a status change. */
function logEvent(db, sub, type, { actorType = "system", actorId = null, data = {}, fromStatus = null, toStatus = null } = {}) {
  return db.subscriptionEvent.create({
    data: { storeId: sub.storeId, subscriptionId: sub.id, type, fromStatus, toStatus, actorType, actorId, data },
  });
}

/**
 * Moves `sub` to `to` (with any other field updates) and logs it.
 * `db` may be a transaction client.
 */
async function transition(db, sub, to, { type, data = {}, patch = {}, actorType = "system", actorId = null } = {}) {
  const from = sub.status;
  if (from !== to && !(ALLOWED[from] || []).includes(to)) {
    throw new HttpError(409, `A subscription can't go from ${from} to ${to}.`);
  }
  const updated = await db.subscription.update({ where: { id: sub.id }, data: { status: to, ...patch } });
  await logEvent(db, sub, type || `status.${to.toLowerCase()}`, { actorType, actorId, data, fromStatus: from, toStatus: to });
  return updated;
}

/** Store.planId mirrors the subscription's plan for older readers (lists,
 * the dashboard). */
async function syncStorePlan(db, storeId, planId) {
  if (planId) await db.store.update({ where: { id: storeId }, data: { planId } });
}

const UNPAID = ["PENDING_PAYMENT", "GRACE_PERIOD", "PAST_DUE", "SUSPENDED", "EXPIRED"];

module.exports = { S, ALLOWED, UNPAID, transition, logEvent, syncStorePlan };
