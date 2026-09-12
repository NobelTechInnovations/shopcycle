const fp = require("fastify-plugin");
const jwt = require("@fastify/jwt");
const cookie = require("@fastify/cookie");
const { env } = require("../config/env");
const { computeAccessState, isAdminBlocked } = require("../modules/billing/access");

/**
 * Cookie-based JWT session. The token payload carries { userId, storeId }
 * — `storeId` is which of the account's (possibly several, see Phase 7
 * multi-store) stores this session is currently "in," set at login/
 * register and changed only by switching stores (re-issues the token).
 * Everything else (role, the store row itself) is re-fetched from the DB
 * per request via loadStoreContext, so a permission change takes effect
 * on the next request instead of waiting for a token to expire.
 */
async function jwtAuthPlugin(fastify) {
  await fastify.register(cookie);
  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: env.COOKIE_NAME, signed: false },
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  fastify.decorate("authenticate", async function authenticate(request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: "Unauthorized" });
    }
  });

  /** The platform-admin panel's own auth check — deliberately reads a
   * completely different cookie (SUPER_ADMIN_COOKIE_NAME) than
   * `authenticate` does, so a seller's session and a platform admin's
   * session can never be confused for each other even though both cookies
   * now live under the same Domain=.oyklane.com (see auth/controller.js).
   * `request.jwtVerify()` can't be reused here — it's hard-wired to
   * @fastify/jwt's configured cookie name — so this verifies the token
   * manually from the specific cookie instead. */
  fastify.decorate("authenticateSuperAdmin", async function authenticateSuperAdmin(request, reply) {
    const token = request.cookies?.[env.SUPER_ADMIN_COOKIE_NAME];
    if (!token) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    try {
      request.user = fastify.jwt.verify(token);
    } catch {
      reply.code(401).send({ error: "Unauthorized" });
    }
  });

  /** Attaches request.user and request.storeUser/request.store.
   * Run this after `authenticate`. Kept separate so routes that only need
   * "is this a logged-in user" (e.g. account settings, switching stores,
   * the super-admin panel) don't pay for — or fail over — a store lookup
   * they don't need. */
  fastify.decorate("loadStoreContext", async function loadStoreContext(request, reply) {
    const user = await fastify.prisma.user.findUnique({ where: { id: request.user.userId } });
    if (!user || user.status === "disabled") {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    // The session's own storeId wins when it's still a valid membership —
    // this is what makes "switch store" actually stick instead of every
    // request falling back to the account's oldest store. An invalid/
    // stale storeId (the membership was removed after the token was
    // issued) falls through to that same oldest-store default.
    const storeUser = request.user.storeId
      ? await fastify.prisma.storeUser.findFirst({
          where: { userId: user.id, storeId: request.user.storeId },
          include: { store: { include: { plan: true } } },
        })
      : null;
    const resolved =
      storeUser ||
      (await fastify.prisma.storeUser.findFirst({
        where: { userId: user.id },
        include: { store: { include: { plan: true } } },
        orderBy: { createdAt: "asc" },
      }));

    if (!resolved) {
      reply.code(403).send({ error: "No store associated with this account" });
      return;
    }
    if (resolved.store.status === "suspended") {
      reply.code(403).send({ error: "This store has been suspended. Contact support for details." });
      return;
    }

    request.currentUser = user;
    request.storeRole = resolved.role;
    request.store = resolved.store;
    // Computed fresh on every request from timestamps (see billing/access.js)
    // — never stale, and never needs a background job to keep it current.
    request.accessState = computeAccessState(resolved.store);
  });

  /** Blocks everything except the billing screens themselves once a store's
   * subscription state says it should be — see billing/access.js for
   * exactly which states trigger this and why. Applied per-module
   * (deliberately NOT inside loadStoreContext itself), so the billing
   * module's own routes — where a merchant actually fixes the problem —
   * never end up gating themselves. */
  fastify.decorate("requireActiveSubscription", async function requireActiveSubscription(request, reply) {
    if (isAdminBlocked(request.accessState)) {
      reply.code(402).send({
        error:
          request.accessState === "needs_plan"
            ? "Choose a plan to continue using your store's admin."
            : "Your last payment failed — update billing to restore admin access.",
        accessState: request.accessState,
      });
    }
  });

  /** Platform-level gate for /api/super-admin/* — deliberately independent
   * of loadStoreContext (a super admin manages every store, not "the
   * current one," and may have zero stores of their own — see the seeded
   * Platform Admin account, which owns no store at all). */
  fastify.decorate("requireSuperAdmin", async function requireSuperAdmin(request, reply) {
    const user = await fastify.prisma.user.findUnique({ where: { id: request.user.userId } });
    if (!user || user.status === "disabled" || !user.isSuperAdmin) {
      reply.code(403).send({ error: "Super admin access required" });
      return;
    }
    request.currentUser = user;
  });
}

module.exports = fp(jwtAuthPlugin, { name: "jwt-auth", dependencies: ["prisma"] });
