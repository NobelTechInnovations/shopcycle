/**
 * Writes one AuditLog row (see schema.prisma). Never throws: the action
 * being audited has already happened by the time this runs, and failing
 * the request because the log write hiccuped would be worse than a gap in
 * the log — so errors are logged loudly instead.
 *
 * Metadata is scrubbed of anything that looks like a secret before it's
 * stored, since callers often pass request bodies straight through.
 */
const SECRET_KEYS = /pass(word)?|secret|token|code|otp|key|authorization|cookie/i;

function scrub(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "[redacted]" : scrub(v, depth + 1)])
    );
  }
  if (typeof value === "string" && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

async function recordAudit(request, { scope, actor, action, storeId, targetType, targetId, metadata }) {
  const fastify = request.server;
  try {
    await fastify.prisma.auditLog.create({
      data: {
        scope,
        actorId: actor?.id || null,
        actorEmail: actor?.email || null,
        action,
        storeId: storeId || null,
        targetType: targetType || null,
        targetId: targetId || null,
        metadata: scrub(metadata || {}),
        ip: request.ip || null,
      },
    });
  } catch (err) {
    fastify.log.error({ err, action }, "audit: failed to write audit log entry");
  }
}

module.exports = { recordAudit, scrub };
