const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { createStoreSchema } = require("@shopcycle/validation");
const { env } = require("../../config/env");
const google = require("../../lib/google-oauth");
const { setSellerSession } = require("../../lib/session");
const { provisionStore } = require("../../lib/store-provisioning");
const service = require("./service");

/**
 * "Continue with Google" on the seller admin. An existing account (matched
 * by Google id, else by the Google-verified email) is signed in; a new
 * email goes to /register with a short-lived ticket to name the first
 * store. Platform accounts never sign in this way — the platform console
 * keeps password + authenticator only.
 */
const CALLBACK = "/api/auth/google/callback";
const COOKIE_PATH = "/api/auth/google";
const AUDIENCE = "google-seller";
const admin = () => env.ADMIN_ORIGIN.replace(/\/$/, "");

function configHandler() {
  return { enabled: google.configured() };
}

function startHandler(request, reply) {
  if (!google.configured()) return reply.redirect(`${admin()}/login?error=${encodeURIComponent("Google sign-in isn't set up yet.")}`);
  return reply.redirect(google.start(request.server, reply, { callbackPath: CALLBACK, cookiePath: COOKIE_PATH, audience: AUDIENCE }));
}

async function callbackHandler(request, reply) {
  const fastify = request.server;
  const fail = (msg) => reply.redirect(`${admin()}/login?error=${encodeURIComponent(msg)}`);
  try {
    if (request.query.error) return fail("Google sign-in was cancelled.");
    const state = google.readState(fastify, request, reply, { audience: AUDIENCE, cookiePath: COOKIE_PATH });
    const who = await google.exchange({ code: request.query.code, callbackPath: CALLBACK, nonce: state.n });
    const prisma = fastify.prisma;

    let user = (await prisma.user.findUnique({ where: { googleSub: who.sub } })) || (await service.findUserByEmail(prisma, who.email));
    if (!user) {
      const ticket = fastify.jwt.sign({ aud: "google-signup", gsub: who.sub, email: who.email, name: who.name }, { expiresIn: "20m" });
      return reply.redirect(`${admin()}/register?google=${encodeURIComponent(ticket)}`);
    }
    if (user.isSuperAdmin) return fail("Platform accounts sign in on the platform console.");
    if (user.status === "disabled") return fail("This account has been disabled.");
    if (user.googleSub && user.googleSub !== who.sub) return fail("This email is linked to a different Google account.");

    user = await prisma.user.update({ where: { id: user.id }, data: { googleSub: who.sub, emailVerifiedAt: user.emailVerifiedAt || new Date() } });
    setSellerSession(reply, fastify, user, await service.defaultStoreIdFor(prisma, user.id));
    return reply.redirect(`${admin()}/admin`);
  } catch (err) {
    request.log.warn({ err }, "google sign-in failed");
    return fail(err instanceof HttpError ? err.message : "Google sign-in didn't complete. Please try again.");
  }
}

const registerSchema = z.object({ ticket: z.string().min(10).max(4000) }).merge(createStoreSchema);

/** New account from Google: the ticket from the callback + a store name. */
async function registerHandler(request, reply) {
  const fastify = request.server;
  const { ticket, storeName, plan } = registerSchema.parse(request.body);
  let t = null;
  try {
    t = fastify.jwt.verify(ticket);
  } catch {}
  if (!t || t.aud !== "google-signup" || !t.email || !t.gsub) throw new HttpError(400, "Your Google sign-up expired. Continue with Google again.");

  const prisma = fastify.prisma;
  const email = service.normalizeEmail(t.email);
  if ((await service.findUserByEmail(prisma, email)) || (await prisma.user.findUnique({ where: { googleSub: t.gsub } }))) {
    throw new HttpError(409, "An account with that email already exists. Sign in instead.");
  }
  // No password yet: "Forgot password" sets one if they ever want it.
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
  const { user, store } = await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.create({ data: { name: t.name || email.split("@")[0], email, passwordHash, emailVerifiedAt: new Date(), googleSub: t.gsub } });
      const store = await provisionStore(tx, { name: storeName, ownerId: user.id, planKey: plan });
      return { user, store };
    },
    { timeout: 30000 }
  );
  setSellerSession(reply, fastify, user, store.id);
  reply.code(201).send({ user: service.serializeUser(user), store });
}

module.exports = { configHandler, startHandler, callbackHandler, registerHandler };
