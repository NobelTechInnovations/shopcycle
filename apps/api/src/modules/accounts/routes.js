const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { throttle } = require("../../lib/throttle");
const google = require("./google");
const facebook = require("./facebook");

// Where a sign-in may send the seller back to: an admin page.
const returnPath = z
  .string()
  .max(200)
  .regex(/^\/admin(\/[A-Za-z0-9_\-/]*)?(\?[A-Za-z0-9_=&\-]*)?$/)
  .optional();

/**
 * /api/accounts — the store's Google and Facebook accounts (Settings ▸
 * Connected accounts, and the "Sign in" buttons on every app that uses
 * them). One sign-in each, shared by all of the store's apps.
 */
async function accountsRoutes(fastify) {
  const { prisma } = fastify;
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  const limit = (request, what) =>
    throttle(fastify, `accounts-${what}:${request.store.id}`, { max: 30, windowSeconds: 3600, message: "That's a lot of tries for one hour — try again a little later." });

  fastify.get("/", async (request) => ({
    google: await google.get(prisma, request.store.id),
    facebook: await facebook.status(prisma, request.store.id),
  }));

  // ── Google ──────────────────────────────────────────────────────

  fastify.post("/google/url", async (request) => {
    const { returnTo } = z.object({ returnTo: returnPath }).parse(request.body || {});
    await limit(request, "google");
    // The state says which store asked and where to go back to.
    const state = fastify.jwt.sign({ aud: "google-connect", sid: request.store.id, ret: returnTo || null }, { expiresIn: "15m" });
    return { url: google.authorizeUrl(state) };
  });

  /** The admin's /admin/apps/google/callback page posts Google's code here. */
  fastify.post("/google/callback", async (request) => {
    const { code, state } = z.object({ code: z.string().min(5).max(2000), state: z.string().min(10).max(2000) }).parse(request.body || {});
    let payload;
    try {
      payload = fastify.jwt.verify(state);
    } catch {
      throw new HttpError(400, "That Google sign-in took too long. Sign in again.");
    }
    if (payload.aud !== "google-connect" || payload.sid !== request.store.id) throw new HttpError(400, "That Google sign-in was for another store. Sign in again.");
    await limit(request, "google");
    const status = await google.connect(prisma, request.store.id, code);
    return { google: status, redirect: returnPath.safeParse(payload.ret).success && payload.ret ? payload.ret : "/admin/settings/accounts" };
  });

  fastify.delete("/google", async (request, reply) => {
    await google.disconnect(prisma, request.store.id);
    reply.code(204);
  });

  // ── Facebook ────────────────────────────────────────────────────

  fastify.post("/facebook/url", async (request) => {
    const { rerequest } = z.object({ rerequest: z.boolean().optional() }).parse(request.body || {});
    await limit(request, "facebook");
    return { url: facebook.authorizeUrl({ rerequest }) };
  });

  // The admin's /admin/apps/meta/callback page posts Facebook's code here;
  // the session says which store (as for Meta Ads).
  fastify.post("/facebook/connect", async (request) => {
    const { code } = z.object({ code: z.string().min(5).max(2000) }).parse(request.body || {});
    await limit(request, "facebook");
    return { facebook: await facebook.connect(prisma, request.store.id, code) };
  });

  fastify.delete("/facebook", async (request, reply) => {
    await facebook.disconnect(prisma, request.store.id);
    reply.code(204);
  });
}

module.exports = accountsRoutes;
