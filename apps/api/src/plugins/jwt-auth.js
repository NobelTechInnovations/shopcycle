const fp = require("fastify-plugin");
const jwt = require("@fastify/jwt");
const cookie = require("@fastify/cookie");
const { env } = require("../config/env");
const { computeAccess } = require("../modules/billing/access");
const entitlements = require("../modules/billing/entitlements");
const { activeMandate } = require("../modules/billing/charges");

/** What a store with a locked dashboard can still reach: billing (to pay)
 * and the store basics the admin's shell needs to show the billing page. */
function reachableWhileLocked(request) {
  const path = String(request.url || "").split("?")[0];
  if (path === "/api/billing" || path.startsWith("/api/billing/")) return true;
  if (request.method === "GET" && (path === "/api/store" || path === "/api/store/")) return true;
  return false;
}

const STORE_INCLUDE = { plan: true, subscription: { include: { plan: { include: { features: true } } } } };

const LOCKED_MESSAGE = {
  pending_payment: "Your free trial has ended. Complete your subscription to keep using your dashboard.",
  locked: "Your subscription payment is overdue. Pay now to unlock your dashboard — your store is still live.",
  suspended: "Your store is offline because of unpaid billing. Pay now to bring it back.",
  cancelled: "Your subscription has ended. Choose a plan to continue.",
};

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

  /**
   * The session cookie's value. A browser can hold two cookies with the same
   * name — an old one scoped to the API's own host (from before
   * COOKIE_DOMAIN was set) and the current one on the shared domain — and
   * sends both. The admin's own server only ever sees the shared-domain one,
   * so the API must use that one too, or the two disagree about which store
   * is open. Browsers list the older cookie first, so the last is current;
   * the stale host-only copy is deleted on the way out.
   */
  function sessionToken(request, reply, name) {
    const raw = request.headers.cookie || "";
    const values = raw
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${name}=`))
      .map((part) => decodeURIComponent(part.slice(name.length + 1)));
    if (values.length > 1 && env.COOKIE_DOMAIN) {
      reply.clearCookie(name, { path: "/" }); // no Domain: removes only the host-only copy
      return values[values.length - 1];
    }
    return request.cookies?.[name];
  }

  fastify.decorate("authenticate", async function authenticate(request, reply) {
    const payload = await verifySession(request, sessionToken(request, reply, env.COOKIE_NAME), AUDIENCE.seller);
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
    const payload = await verifySession(request, sessionToken(request, reply, env.SUPER_ADMIN_COOKIE_NAME), AUDIENCE.platform);
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
          include: { store: { include: STORE_INCLUDE } },
        })
      : null;
    const resolved =
      storeUser ||
      (await fastify.prisma.storeUser.findFirst({
        where: { userId: user.id },
        include: { store: { include: STORE_INCLUDE } },
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

    const store = resolved.store;
    request.currentUser = user;
    request.storeRole = resolved.role;
    request.store = store;

    // Access comes from the billing engine's subscription (billing/access.js)
    // — computed on every request from its status and dates, so a lock
    // takes effect on the next request without waiting for a job.
    const sub = store.subscription;
    const trialOver = sub?.status === "TRIALING" && sub.trialEndsAt && new Date(sub.trialEndsAt) <= new Date();
    const mandateActive = trialOver ? Boolean(await activeMandate(fastify.prisma, sub.id)) : false;
    const access = computeAccess(sub, { storeStatus: store.status, mandateActive });
    request.subscription = sub || null;
    request.access = access;
    request.accessState = access.accessState;

    // Entitlements (plan features + per-store grants), loaded on first use.
    let ent = null;
    request.getEntitlements = async () => {
      if (!ent) ent = entitlements.compute(sub?.plan || null, await entitlements.activeGrants(fastify.prisma, store.id));
      return ent;
    };

    if (!access.dashboard && !reachableWhileLocked(request)) {
      reply.code(402).send({ error: LOCKED_MESSAGE[access.reason] || LOCKED_MESSAGE.locked, code: "billing_locked", reason: access.reason, accessState: access.accessState });
      return reply;
    }
  });

  /** Kept for the modules that add it explicitly — loadStoreContext
   * already enforces the same lock centrally. */
  fastify.decorate("requireActiveSubscription", async function requireActiveSubscription(request, reply) {
    if (reply.sent) return reply;
    if (request.access && !request.access.dashboard && !reachableWhileLocked(request)) {
      reply.code(402).send({ error: LOCKED_MESSAGE[request.access.reason] || LOCKED_MESSAGE.locked, code: "billing_locked", reason: request.access.reason, accessState: request.accessState });
    }
  });

  /** Plan features, enforced server-side — hiding a button in the admin
   * isn't a lock. Takes feature keys from billing/catalog.js (older Plan
   * flag names like "hasMetaAds" are mapped). An array means "any of
   * these". Use after loadStoreContext:
   * `fastify.addHook("preHandler", fastify.requirePlanFeature("marketing_tools"))` */
  fastify.decorate("requirePlanFeature", function requirePlanFeature(keys) {
    const required = Array.isArray(keys) ? keys : [keys];
    return async function planFeatureGate(request, reply) {
      if (reply.sent || !request.getEntitlements) return;
      const ent = await request.getEntitlements();
      if (required.some((k) => entitlements.has(ent, k))) return;
      reply.code(403).send({
        error: `This feature isn't part of your ${ent.plan?.name || "current"} plan. Upgrade in Settings ▸ Plan & billing to use it.`,
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
