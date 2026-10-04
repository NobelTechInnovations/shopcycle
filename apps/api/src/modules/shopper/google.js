const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const google = require("../../lib/google-oauth");
const { storefrontBaseUrl, oyklaneAddress } = require("../../lib/storefront-url");
const customersRepository = require("../customers/repository");
const service = require("./service");

/**
 * "Continue with Google" for shoppers. Stores live on many domains, so
 * Google always returns to one fixed API callback; the store is carried in
 * the signed state, and the shopper is sent back to the store's own
 * address (only ever one the API computes for that store) with a
 * two-minute, single-use ticket that the storefront swaps for a session.
 * A Google-verified email proves ownership, so it signs into (or creates)
 * the customer with that email.
 */
const CALLBACK = "/api/shopper/google/callback";
const COOKIE_PATH = "/api/shopper/google";
const AUDIENCE = "google-shopper";

function storeBases(store) {
  return [...new Set([storefrontBaseUrl(store), oyklaneAddress(store)].filter(Boolean).map((b) => b.replace(/\/$/, "")))];
}

async function startHandler(request, reply) {
  const fastify = request.server;
  const handle = String(request.query.store || "");
  const store = handle ? await fastify.prisma.store.findUnique({ where: { handle } }) : null;
  if (!store || store.status !== "active") throw new HttpError(404, "Store not found");
  const base = String(request.query.base || "").replace(/\/$/, "");
  if (!storeBases(store).includes(base)) throw new HttpError(400, "This sign-in link isn't valid for this store.");
  if (!google.configured()) return reply.redirect(`${base}/account/login?formError=${encodeURIComponent("Google sign-in isn't available right now.")}`);
  const returnTo = ["cart", "checkout"].includes(request.query.return_to) ? request.query.return_to : "";
  // Hash of a nonce the storefront keeps in its own cookie — the ticket is
  // only accepted back in that same browser (see exchangeTicket).
  const sn = String(request.query.sn || "");
  if (!/^[0-9a-f]{64}$/.test(sn)) throw new HttpError(400, "This sign-in link isn't valid for this store.");
  return reply.redirect(google.start(fastify, reply, { callbackPath: CALLBACK, cookiePath: COOKIE_PATH, audience: AUDIENCE, data: { sid: store.id, base, rt: returnTo, sn } }));
}

async function callbackHandler(request, reply) {
  const fastify = request.server;
  let state;
  try {
    state = google.readState(fastify, request, reply, { audience: AUDIENCE, cookiePath: COOKIE_PATH });
  } catch (err) {
    return reply.code(400).type("text/plain; charset=utf-8").send(`${err.message}\n\nGo back to the store and try again.`);
  }
  const fail = (msg) => reply.redirect(`${state.base}/account/login?formError=${encodeURIComponent(msg)}`);
  try {
    if (request.query.error) return fail("Google sign-in was cancelled.");
    const who = await google.exchange({ code: request.query.code, callbackPath: CALLBACK, nonce: state.n });
    const prisma = fastify.prisma;
    const store = await prisma.store.findUnique({ where: { id: state.sid } });
    if (!store || store.status !== "active") return fail("This store isn't available.");

    const existing = await customersRepository.findByEmail(prisma, store.id, who.email);
    const customer = existing || (await customersRepository.create(prisma, store.id, { email: who.email, name: who.name || who.email.split("@")[0] }));
    await prisma.customer.update({ where: { id: customer.id }, data: { emailVerifiedAt: customer.emailVerifiedAt || new Date(), lastSignInAt: new Date() } });

    const ticket = fastify.jwt.sign({ aud: "shopper-google", sid: store.id, cid: customer.id, sn: state.sn, jti: crypto.randomUUID() }, { expiresIn: "2m" });
    const q = new URLSearchParams({ ticket, ...(state.rt && { return_to: state.rt }) });
    return reply.redirect(`${state.base}/account/google/callback?${q}`);
  } catch (err) {
    request.log.warn({ err }, "shopper google sign-in failed");
    return fail(err instanceof HttpError ? err.message : "Google sign-in didn't complete. Please try again.");
  }
}

/** POST /api/storefront/:handle/account/google/exchange — ticket → session. */
async function exchangeTicket(fastify, store, ticket, nonce) {
  let t = null;
  try {
    t = fastify.jwt.verify(String(ticket || ""));
  } catch {}
  if (!t || t.aud !== "shopper-google" || t.sid !== store.id || !t.cid || !t.jti) throw new HttpError(400, "That Google sign-in expired. Please try again.");
  const sn = crypto.createHash("sha256").update(String(nonce || "")).digest("hex");
  if (!nonce || sn !== t.sn) throw new HttpError(400, "That Google sign-in was started in another browser. Please try again.");
  const uses = await fastify.redis.incr(`google-ticket:${t.jti}`);
  if (uses === 1) await fastify.redis.expire(`google-ticket:${t.jti}`, 300);
  if (uses > 1) throw new HttpError(400, "That Google sign-in link was already used. Please try again.");
  const customer = await fastify.prisma.customer.findFirst({ where: { id: t.cid, storeId: store.id } });
  if (!customer) throw new HttpError(400, "That Google sign-in expired. Please try again.");
  return { token: service.signSession(fastify, store, customer, "google"), customer };
}

async function shopperGoogleRoutes(fastify) {
  const limit = { rateLimit: { max: 30, timeWindow: "1 minute" } };
  fastify.get("/google/start", { config: limit }, startHandler);
  fastify.get("/google/callback", { config: limit }, callbackHandler);
}

module.exports = { shopperGoogleRoutes, exchangeTicket, storeBases };
