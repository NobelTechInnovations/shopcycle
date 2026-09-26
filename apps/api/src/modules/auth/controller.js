const { storefrontBaseUrl, oyklaneAddress } = require("../../lib/storefront-url");
const { z } = require("zod");
const { registerSchema, loginSchema, createStoreSchema, switchStoreSchema } = require("@shopcycle/validation");
const { HttpError } = require("@shopcycle/utils");
const { provisionStore } = require("../../lib/store-provisioning");
const { computeAccessState } = require("../billing/access");
const { setSellerSession, setPlatformSession, clearSellerSession, clearPlatformSession } = require("../../lib/session");
const loginGuard = require("../../lib/login-guard");
const { recordAudit } = require("../../lib/audit");
const twoFactor = require("../../lib/two-factor");
const service = require("./service");
const { sendVerificationEmail } = require("./recovery");

async function registerHandler(request, reply) {
  const body = registerSchema.parse(request.body);
  const { user, store } = await service.register(request.server.prisma, body);
  setSellerSession(reply, request.server, user, store.id);
  // Never fails sign-up: the dashboard offers "resend" if this didn't land.
  await sendVerificationEmail(request.server.prisma, user, request.log);
  reply.code(201).send({ user: service.serializeUser(user), store });
}

/** Wraps service.login with the per-account lockout (lib/login-guard.js):
 * refuse outright while locked, count each failure, reset on success.
 * `scope` keeps seller and platform counters separate, so hammering one
 * console can't lock the same person out of the other. */
async function guardedLogin(request, scope, body) {
  const fastify = request.server;
  await loginGuard.assertNotLocked(fastify, scope, body.email);
  try {
    return await service.login(fastify.prisma, body);
  } catch (err) {
    if (err instanceof HttpError && err.statusCode === 401) {
      await loginGuard.recordFailure(fastify, scope, body.email);
    }
    throw err;
  }
}

async function loginHandler(request, reply) {
  const body = loginSchema.parse(request.body);
  const user = await guardedLogin(request, "seller", body);
  await loginGuard.clearFailures(request.server, "seller", body.email);
  const storeId = await service.defaultStoreIdFor(request.server.prisma, user.id);
  setSellerSession(reply, request.server, user, storeId);
  reply.send({ user: service.serializeUser(user) });
}

async function logoutHandler(request, reply) {
  clearSellerSession(reply);
  reply.send({ ok: true });
}

/** Ends every session this account has, on every device — for a lost
 * laptop or a suspected leak. Bumping tokenVersion invalidates all tokens
 * already issued (see plugins/jwt-auth.js); this browser's cookie is
 * cleared too, so the caller is signed out as well. */
async function logoutEverywhereHandler(request, reply) {
  const user = await request.server.prisma.user.update({
    where: { id: request.user.userId },
    data: { tokenVersion: { increment: 1 } },
  });
  await recordAudit(request, {
    scope: "store",
    actor: user,
    action: "auth.sign_out_everywhere",
    targetType: "user",
    targetId: user.id,
  });
  clearSellerSession(reply);
  reply.send({ ok: true });
}

/** Platform sign-in, step 1 of 1 or 2. Password is checked here; if the
 * account has an authenticator app enabled, no session is issued yet —
 * instead a 5-minute challenge token comes back, and the session is only
 * issued by superAdminVerifyTwoFactorHandler once the code checks out. A
 * non-super-admin account is rejected server-side, never "logged in and
 * then bounced" by the frontend. */
async function superAdminLoginHandler(request, reply) {
  const body = loginSchema.parse(request.body);
  const user = await guardedLogin(request, "platform", body);
  if (!user.isSuperAdmin) {
    throw new HttpError(403, "This account is not a platform admin.");
  }
  await loginGuard.clearFailures(request.server, "platform", body.email);

  if (user.totpEnabledAt) {
    reply.send({ requiresTwoFactor: true, challengeToken: twoFactor.issueChallenge(request.server, user) });
    return;
  }

  setPlatformSession(reply, request.server, user);
  await recordAudit(request, { scope: "platform", actor: user, action: "auth.platform_sign_in" });
  reply.send({ user: service.serializeUser(user) });
}

const verifySchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app"),
});

/** Platform sign-in, step 2: the authenticator code. Wrong codes count
 * toward a lockout just like wrong passwords (keyed on the account), so the
 * six digits can't be brute-forced within the challenge's 5 minutes. */
async function superAdminVerifyTwoFactorHandler(request, reply) {
  const { challengeToken, code } = verifySchema.parse(request.body);
  const fastify = request.server;
  const user = await twoFactor.userFromChallenge(fastify, challengeToken);
  if (!user) throw new HttpError(401, "Your sign-in expired. Enter your email and password again.");

  await loginGuard.assertNotLocked(fastify, "platform-2fa", user.id);
  if (!(await twoFactor.consumeCode(fastify, user, code))) {
    await loginGuard.recordFailure(fastify, "platform-2fa", user.id);
    await recordAudit(request, { scope: "platform", actor: user, action: "auth.2fa_failed" });
    throw new HttpError(401, "That code didn't match. Check your authenticator app and try again.");
  }
  await loginGuard.clearFailures(fastify, "platform-2fa", user.id);

  setPlatformSession(reply, fastify, user);
  await recordAudit(request, { scope: "platform", actor: user, action: "auth.platform_sign_in", metadata: { twoFactor: true } });
  reply.send({ user: service.serializeUser(user) });
}

async function superAdminLogoutHandler(request, reply) {
  clearPlatformSession(reply);
  reply.send({ ok: true });
}

/** The platform-admin panel's own "who am I" — authenticateSuperAdmin has
 * already loaded and checked the user (request.authUser). No store lookup:
 * a super admin manages every store, not "the current one". */
async function superAdminMeHandler(request, reply) {
  const user = request.authUser;
  if (!user?.isSuperAdmin) {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  reply.send({ user: service.serializeUser(user) });
}

/** Deliberately does its own store lookup instead of depending on
 * loadStoreContext — a user can legitimately have zero stores (a
 * store-less super admin account) and this endpoint is how the frontend
 * finds that out, rather than 403ing before it can decide where to send
 * them. */
async function meHandler(request, reply) {
  const user = request.authUser;

  const where = request.user.storeId ? { userId: user.id, storeId: request.user.storeId } : { userId: user.id };
  const storeUser =
    (await request.server.prisma.storeUser.findFirst({
      where,
      include: { store: { include: { plan: true } } },
    })) ||
    (await request.server.prisma.storeUser.findFirst({
      where: { userId: user.id },
      include: { store: { include: { plan: true } } },
      orderBy: { createdAt: "asc" },
    }));

  reply.send({
    user: service.serializeUser(user),
    store: storeUser?.store
      ? { ...storeUser.store, publicUrl: storefrontBaseUrl(storeUser.store), oyklaneUrl: oyklaneAddress(storeUser.store) }
      : null,
    role: storeUser?.role || null,
    // Lets the admin app's own layout gate to the billing screen without a
    // second round trip — same computation loadStoreContext does per
    // request for every other route (see billing/access.js).
    accessState: storeUser?.store ? computeAccessState(storeUser.store) : null,
  });
}

/** Every store this account belongs to — feeds the admin's store
 * switcher. Only `authenticate`, not `loadStoreContext`: listing stores
 * is exactly the thing a user with no "current" store yet still needs
 * to do. */
async function myStoresHandler(request, reply) {
  const storeUsers = await request.server.prisma.storeUser.findMany({
    where: { userId: request.user.userId },
    include: { store: true },
    orderBy: { createdAt: "asc" },
  });
  reply.send({
    stores: storeUsers.map((su) => ({ id: su.store.id, name: su.store.name, handle: su.store.handle, role: su.role })),
  });
}

/** "Create a new store with the same account" — the multi-store version
 * of registration: same provisioning (plan deadline, default theme) minus
 * creating a second User row. Switches the session to the new store. */
async function createStoreHandler(request, reply) {
  const body = createStoreSchema.parse(request.body);
  const store = await request.server.prisma.$transaction(
    (tx) => provisionStore(tx, { name: body.storeName, ownerId: request.user.userId }),
    { timeout: 15000 }
  );
  setSellerSession(reply, request.server, request.authUser, store.id);
  reply.code(201).send({ store });
}

async function switchStoreHandler(request, reply) {
  const { storeId } = switchStoreSchema.parse(request.body);
  const storeUser = await request.server.prisma.storeUser.findFirst({
    where: { userId: request.user.userId, storeId },
    include: { store: true },
  });
  if (!storeUser) throw new HttpError(404, "You don't have access to that store");
  setSellerSession(reply, request.server, request.authUser, storeId);
  reply.send({ store: storeUser.store });
}

module.exports = {
  registerHandler,
  loginHandler,
  logoutHandler,
  logoutEverywhereHandler,
  meHandler,
  myStoresHandler,
  createStoreHandler,
  switchStoreHandler,
  superAdminLoginHandler,
  superAdminVerifyTwoFactorHandler,
  superAdminLogoutHandler,
  superAdminMeHandler,
};
