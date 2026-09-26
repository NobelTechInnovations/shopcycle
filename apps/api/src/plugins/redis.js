const fp = require("fastify-plugin");
const Redis = require("ioredis");
const { env } = require("../config/env");

/**
 * `fastify.redis` — short-lived, loss-tolerant state only: analytics' live
 * visitor list, login-lockout counters (lib/login-guard.js), and used 2FA
 * codes (lib/two-factor.js). Anything that must survive a restart — carts,
 * sessions, orders — lives in Postgres instead.
 *
 * Redis is optional. With REDIS_URL set and reachable, it's used (and
 * shared across API processes). Otherwise this falls back to an in-memory
 * store implementing the same handful of commands, so the API runs on a
 * host with no Redis at all (Hostinger shared hosting, a laptop without
 * Docker). The trade-off, logged at startup: those counters and the live
 * view become per-process instead of shared.
 */
async function redisPlugin(fastify) {
  const client = env.REDIS_URL ? await connectOrNull(fastify, env.REDIS_URL) : null;
  if (client) {
    fastify.decorate("redis", client);
    fastify.addHook("onClose", async () => {
      await client.quit().catch(() => {});
    });
    fastify.log.info("Redis connected");
    return;
  }
  fastify.log.warn(
    "Redis unavailable — using an in-memory store. Live visitors and login-lockout counters are per-process until REDIS_URL points at a reachable Redis."
  );
  fastify.decorate("redis", new MemoryKV());
}

async function connectOrNull(fastify, url) {
  const client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 2,
    // Give up quickly at startup instead of retrying forever...
    retryStrategy: () => null,
  });
  client.on("error", () => {}); // connection errors are handled below / by the live retry strategy
  try {
    await client.connect();
    // ...but once connected, ride out brief outages with backoff.
    client.options.retryStrategy = (times) => Math.min(times * 200, 5000);
    client.on("error", (err) => fastify.log.error({ err }, "Redis connection error"));
    return client;
  } catch {
    client.disconnect();
    return null;
  }
}

/** The subset of Redis this codebase uses, in process memory, with TTLs.
 * Mirrors ioredis's return conventions ("OK"/null for SET, counts for DEL,
 * -2/-1 for TTL) so callers can't tell the difference. */
class MemoryKV {
  constructor() {
    this.map = new Map(); // key -> { value, expiresAt|null }
    // Expired keys are dropped on read; this sweep bounds memory for keys
    // nobody reads again (e.g. a visitor who left).
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  entry(key) {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expiresAt && e.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return e;
  }

  sweep() {
    const now = Date.now();
    for (const [k, e] of this.map) if (e.expiresAt && e.expiresAt <= now) this.map.delete(k);
  }

  async get(key) {
    return this.entry(key)?.value ?? null;
  }

  async mget(...keys) {
    return keys.flat().map((k) => this.entry(k)?.value ?? null);
  }

  /** SET key value [EX seconds] [NX] */
  async set(key, value, ...args) {
    const opts = args.map((a) => (typeof a === "string" ? a.toUpperCase() : a));
    if (opts.includes("NX") && this.entry(key)) return null;
    const exIdx = opts.indexOf("EX");
    const expiresAt = exIdx >= 0 ? Date.now() + Number(opts[exIdx + 1]) * 1000 : null;
    this.map.set(key, { value: String(value), expiresAt });
    return "OK";
  }

  async del(...keys) {
    let n = 0;
    for (const k of keys.flat()) if (this.map.delete(k)) n += 1;
    return n;
  }

  async incr(key) {
    const e = this.entry(key);
    const next = (Number(e?.value) || 0) + 1;
    this.map.set(key, { value: String(next), expiresAt: e?.expiresAt ?? null });
    return next;
  }

  async expire(key, seconds) {
    const e = this.entry(key);
    if (!e) return 0;
    e.expiresAt = Date.now() + Number(seconds) * 1000;
    return 1;
  }

  async ttl(key) {
    const e = this.entry(key);
    if (!e) return -2;
    if (!e.expiresAt) return -1;
    return Math.ceil((e.expiresAt - Date.now()) / 1000);
  }

  /** SCAN cursor MATCH pattern COUNT n — returns everything in one page
   * (cursor "0"), which is all callers need from an in-process map. */
  async scan(cursor, ...args) {
    const upper = args.map((a) => (typeof a === "string" ? a.toUpperCase() : a));
    const mIdx = upper.indexOf("MATCH");
    const pattern = mIdx >= 0 ? args[mIdx + 1] : "*";
    const re = new RegExp(`^${pattern.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
    const keys = [];
    for (const k of this.map.keys()) if (this.entry(k) && re.test(k)) keys.push(k);
    return ["0", keys];
  }

  async quit() {
    clearInterval(this.sweeper);
    return "OK";
  }

  on() {
    return this;
  }
}

module.exports = fp(redisPlugin, { name: "redis" });
module.exports.MemoryKV = MemoryKV;
