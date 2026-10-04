const { HttpError } = require("@shopcycle/utils");

/**
 * A fixed-window counter keyed on WHO is doing something (an email, an
 * order) rather than an IP address. Storefront requests all reach the API
 * from the storefront server's own IP, so an IP limit there would throttle
 * every shopper at once — but "10 order lookups per email per 15 minutes"
 * stops guessing without affecting anyone else.
 *
 * Uses Redis when configured, the in-memory fallback otherwise (see
 * plugins/redis.js). Fails open if the store is unreachable: a counter
 * outage must never lock shoppers out.
 */
async function throttle(fastify, key, { max, windowSeconds, message }) {
  try {
    const fullKey = `throttle:${key}`;
    const count = await fastify.redis.incr(fullKey);
    if (count === 1) await fastify.redis.expire(fullKey, windowSeconds);
    if (count > max) {
      const ttl = await fastify.redis.ttl(fullKey);
      const minutes = Math.max(1, Math.ceil((ttl > 0 ? ttl : windowSeconds) / 60));
      throw new HttpError(429, message || `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    fastify.log.warn({ err }, "throttle: counter unavailable, allowing request");
  }
}

module.exports = { throttle };
