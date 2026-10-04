const { HttpError } = require("@shopcycle/utils");

const MAX_FAILURES = 8;
const WINDOW_SECONDS = 15 * 60;

/**
 * Per-account lockout after repeated wrong passwords. Complements the
 * per-IP rate limit in app.js: that one stops a single machine hammering
 * the endpoint; this one stops a distributed attack (many IPs, one target
 * account), which an IP limit alone can't see.
 *
 * Counted in Redis with a TTL, so a lockout clears itself. If Redis is
 * unreachable this fails OPEN (logs and lets the attempt proceed): an
 * infrastructure hiccup must never lock every merchant out of their store,
 * and the per-IP limit still applies.
 */
function keyFor(scope, email) {
  return `auth:fail:${scope}:${String(email).trim().toLowerCase()}`;
}

async function assertNotLocked(fastify, scope, email) {
  try {
    const key = keyFor(scope, email);
    const count = Number(await fastify.redis.get(key)) || 0;
    if (count >= MAX_FAILURES) {
      const ttl = await fastify.redis.ttl(key);
      const minutes = Math.max(1, Math.ceil((ttl > 0 ? ttl : WINDOW_SECONDS) / 60));
      throw new HttpError(429, `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    fastify.log.warn({ err }, "login-guard: Redis unavailable, skipping lockout check");
  }
}

async function recordFailure(fastify, scope, email) {
  try {
    const key = keyFor(scope, email);
    const count = await fastify.redis.incr(key);
    // TTL is set on the first failure only, so the window is fixed from the
    // first wrong attempt rather than sliding forward on every retry.
    if (count === 1) await fastify.redis.expire(key, WINDOW_SECONDS);
  } catch (err) {
    fastify.log.warn({ err }, "login-guard: Redis unavailable, failure not counted");
  }
}

async function clearFailures(fastify, scope, email) {
  try {
    await fastify.redis.del(keyFor(scope, email));
  } catch {
    // Nothing to do — an uncleared counter just expires on its own.
  }
}

module.exports = { assertNotLocked, recordFailure, clearFailures };
