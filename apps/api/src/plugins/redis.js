const fp = require("fastify-plugin");
const Redis = require("ioredis");
const { env } = require("../config/env");

/** Decorates the Fastify instance with a shared ioredis client — backs the
 * anonymous storefront cart (see modules/cart). Nothing else uses Redis
 * yet; sessions/queues are still plain JWT/synchronous as noted in Phase 1. */
async function redisPlugin(fastify) {
  const redis = new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 });
  redis.on("error", (err) => fastify.log.error({ err }, "Redis connection error"));

  fastify.decorate("redis", redis);
  fastify.addHook("onClose", async () => {
    await redis.quit().catch(() => {});
  });
}

module.exports = fp(redisPlugin, { name: "redis" });
