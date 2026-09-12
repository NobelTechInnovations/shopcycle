const { registerSchema, loginSchema, createStoreSchema, switchStoreSchema } = require("@shopcycle/validation");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { provisionStore } = require("../../lib/store-provisioning");
const service = require("./service");

// "lax" works fine in dev (every app runs on localhost, so they're all
// same-site regardless of port) and would also work in prod if every app
// shared one registrable domain — but the platform-admin panel is a
// genuinely separate domain (adminshopcycle.com vs shopcycle.com), which
// "lax" cookies are not sent for on cross-site fetch(). "none" + secure is
// the one setting that's correct for both same-site and cross-site callers,
// so it's used whenever the cookie will actually cross HTTPS in production;
// "none" without "secure" is silently rejected by browsers, which is why
// dev (plain http) has to stay on "lax" instead.
const cookieOptions = {
  httpOnly: true,
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  secure: env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

function issueSession(reply, fastify, user, storeId) {
  const token = fastify.jwt.sign({ userId: user.id, storeId: storeId || null });
  reply.setCookie(env.COOKIE_NAME, token, cookieOptions);
}

async function registerHandler(request, reply) {
  const body = registerSchema.parse(request.body);
  const { user, store } = await service.register(request.server.prisma, body);
  issueSession(reply, request.server, user, store.id);
  reply.code(201).send({ user: service.serializeUser(user), store });
}

async function loginHandler(request, reply) {
  const body = loginSchema.parse(request.body);
  const user = await service.login(request.server.prisma, body);
  const storeId = await service.defaultStoreIdFor(request.server.prisma, user.id);
  issueSession(reply, request.server, user, storeId);
  reply.send({ user: service.serializeUser(user) });
}

async function logoutHandler(request, reply) {
  reply.clearCookie(env.COOKIE_NAME, { path: "/" });
  reply.send({ ok: true });
}

/** Deliberately does its own store lookup instead of depending on
 * loadStoreContext — a user can legitimately have zero stores (a
 * store-less super admin account) and this endpoint is how the frontend
 * finds that out, rather than 403ing before it can decide where to send
 * them. */
async function meHandler(request, reply) {
  const user = await request.server.prisma.user.findUnique({ where: { id: request.user.userId } });
  if (!user || user.status === "disabled") {
    reply.code(401).send({ error: "Unauthorized" });
    return;
  }

  const where = request.user.storeId
    ? { userId: user.id, storeId: request.user.storeId }
    : { userId: user.id };
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
    store: storeUser?.store || null,
    role: storeUser?.role || null,
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
 * of registration: same provisioning (plan, trial, default theme) minus
 * creating a second User row, since this one already has an account.
 * Switches the session to the new store, same as switchStoreHandler. */
async function createStoreHandler(request, reply) {
  const body = createStoreSchema.parse(request.body);
  const store = await request.server.prisma.$transaction((tx) =>
    provisionStore(tx, { name: body.storeName, ownerId: request.user.userId })
  );
  issueSession(reply, request.server, { id: request.user.userId }, store.id);
  reply.code(201).send({ store });
}

async function switchStoreHandler(request, reply) {
  const { storeId } = switchStoreSchema.parse(request.body);
  const storeUser = await request.server.prisma.storeUser.findFirst({
    where: { userId: request.user.userId, storeId },
    include: { store: true },
  });
  if (!storeUser) throw new HttpError(404, "You don't have access to that store");
  issueSession(reply, request.server, { id: request.user.userId }, storeId);
  reply.send({ store: storeUser.store });
}

module.exports = {
  registerHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  myStoresHandler,
  createStoreHandler,
  switchStoreHandler,
};
