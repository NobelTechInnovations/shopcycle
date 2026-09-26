const fp = require("fastify-plugin");
const jwt = require("@fastify/jwt");
const cookie = require("@fastify/cookie");
const { env } = require("../config/env");
const { computeAccessState, isAdminBlocked } = require("../modules/billing/access");
const { applyDuePendingPlan } = require("../modules/billing/plan-change");

/** Which console a session token was issued for. Both consoles share one
 * signing secret, so without this a token is valid wherever it's presented
 * — e.g. a super admin's *seller* session (no 2FA) copied into the platform
 * cookie would open the platform console, skipping its second factor. */
const AUDIENCE = { seller: "seller", platform: "platform" };

/**
 * Cookie-based JWT session. The token payload carries
 * { userId, storeId, tv, aud } — `storeId` is which of the account's
 * (possibly several) stores this session is currently "in"; `tv` is the
 * user's tokenVersion at sign-in (bumped to revoke every session at once);
 * `aud` is the console it belongs to. Everything else (role, the store row
 * itself) is re-fetched from the DB per request, so a permission change
 * takes effect on the next request instead of when a token expires.
 */
async function jwtAuthPlugin(fastify) {
  await fastify.register(cookie);
  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: env.COOKIE_NAME, signed: false },
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  /** Signs a session token for one console. Every sign-in path goes
   * through here so no token is ever issued without `tv` and `aud`. */
  fastify.decorate("signSession", function signSession(user, { audience, storeId = null }) {
    return fastify.jwt.sign({ userId: user.id, storeId, tv: user.tokenVersion ?? 0, aud: audience });
  });

  /** Returns the verified payload, or null for anything that shouldn't be
   * treated as a live session: bad signature/expired, a short-lived
   * challenge token (see auth 2FA — those carry `purpose` and are never
   * sessions), a token for the other console, a disabled user, or a token
   * minted before the user's sessions were revoked. Sets request.authUser
   * so later hooks don't re-query the same row. */
  async function verifySession(request, token, audience) {
    if (!token) return null;
    let payload;
    try {
      payload = fastify.jwt.verify(token);
    } catch {
      return null;
    }
    if (payload.purpose) return null;
    if (audience === AUDIENCE.platform && payload.aud !== AUDIENCE.platform) return null;
    // Seller tokens issued before `aud` existed have none — still honored
    // until they expire (≤7 days), so nobody is logged out by this deploy.
    if (audience === AUDIENCE.seller && payload.aud && payload.aud !== AUDIENCE.seller) return null;

    const user = await fastify.prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.status === "disabled") return null;
    if ((payload.tv ?? 0) !== user.tokenVersion) return null;

    request.authUser = user;
    return payload;
  }

  fastify.decorate("authenticate", async function authenticate(request, reply) {
    const payload = await verifySession(request, request.cookies?.[env.COOKIE_NAME], AUDIENCE.seller);
    if (!payload) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    request.user = payload;
  });

  /** The platform-admin panel's own auth check — reads a completely
   * different cookie (SUPER_ADMIN_COOKIE_NAME) than `authenticate`, and
   * only accepts tokens minted for the platform console. */
  fastify.decorate("authenticateSuperAdmin", async function authenticateSuperAdmin(request, reply) {
    const payload = await verifySession(request, request.cookies?.[env.SUPER_ADMIN_COOKIE_NAME], AUDIENCE.platform);
    if (!payload) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    request.user = payload;
  });

  /** Attaches request.currentUser, request.storeRole, request.store.
   * Run this after `authenticate`. Kept separate so routes that only need
   * "is this a logged-in user" (e.g. switching stores) don't pay for — or
   * fail over — a store lookup they don't need. */
  fastify.decorate("loadStoreContext", async function loadStoreContext(request, reply) {
    const user = request.authUser;
    if (!user) {
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

    // Fallback for a downgrade whose renewal webhook never arrived: once
    // the paid period is over, the store moves to the scheduled plan.
    const store = resolved.store.pendingPlanId
      ? await applyDuePendingPlan(fastify.prisma, resolved.store)
      : resolved.store;

    request.currentUser = user;
    request.storeRole = resolved.role;
    request.store = store;
    // Computed fresh on every request from timestamps (see billing/access.js)
    // — never stale, and never needs a background job to keep it current.
    request.accessState = computeAccessState(store);
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

  /** Premium-only features, enforced server-side — hiding a button in the
   * admin isn't a lock. `flag` is one of the Plan booleans (hasMetaAds,
   * hasWhatsappIntegration, hasCsvExport, hasApiAccess, ...). A store with
   * no plan yet gets none of them: its free month starts only once it
   * picks a plan, and it may well pick Starter. Returns a hook; use as
   * `fastify.addHook("preHandler", fastify.requirePlanFeature("hasMetaAds"))`
   * after loadStoreContext. An array means "any of these" — for shared
   * plumbing (the Meta connection) that more than one feature relies on. */
  fastify.decorate("requirePlanFeature", function requirePlanFeature(flags) {
    const required = Array.isArray(flags) ? flags : [flags];
    return async function planFeatureGate(request, reply) {
      if (required.some((flag) => request.store?.plan?.[flag])) return;
      reply.code(403).send({
        error: "This feature is part of the Premium plan. Upgrade in Settings › Billing to use it.",
        code: "plan_upgrade_required",
        feature: required[0],
      });
    };
  });

  /** Platform-level gate for /api/super-admin/* — deliberately independent
   * of loadStoreContext (a super admin manages every store, not "the
   * current one," and may have zero stores of their own). */
  fastify.decorate("requireSuperAdmin", async function requireSuperAdmin(request, reply) {
    const user = request.authUser;
    if (!user || !user.isSuperAdmin) {
      reply.code(403).send({ error: "Super admin access required" });
      return;
    }
    request.currentUser = user;
  });
}

module.exports = fp(jwtAuthPlugin, { name: "jwt-auth", dependencies: ["prisma"] });
module.exports.AUDIENCE = AUDIENCE;
