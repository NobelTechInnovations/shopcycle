/**
 * Adds an entry to an order's timeline (OrderEvent). Pass a transaction
 * client to record it atomically with the change it describes. Never
 * throws outside a transaction: a missing timeline line isn't worth
 * failing the action itself over.
 */
async function addOrderEvent(db, orderId, { kind, message, actorName = null, meta = {} }, { strict = false } = {}) {
  try {
    return await db.orderEvent.create({ data: { orderId, kind, message, actorName, meta } });
  } catch (err) {
    if (strict) throw err;
    return null;
  }
}

/** Who did it, as shown on the timeline: "Priya Sharma" for staff actions,
 * null (the system) when there's no signed-in user. */
function actorNameFrom(request) {
  return request?.authUser?.name || null;
}

module.exports = { addOrderEvent, actorNameFrom };
