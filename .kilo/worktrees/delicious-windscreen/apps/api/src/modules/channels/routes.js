const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const appsService = require("../apps/service");
const connections = require("../social/connections");
const google = require("../../lib/google-api");
const { throttle } = require("../../lib/throttle");
const googleChannel = require("./google");
const facebookChannel = require("./facebook");

const CODE = /^[A-Za-z0-9_\-:.]{4,120}$/;

/**
 * /api/channels — the Google & YouTube and Facebook & Instagram sales
 * channels: connect the seller's Merchant Center / catalog, sync, status,
 * and the domain verification tags both ask for.
 */
async function channelRoutes(fastify) {
  const { prisma } = fastify;
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  const installed = (key) => async (request) => appsService.assertInstalled(prisma, request.store.id, key);
  const limit = (request, what, max = 30) => throttle(fastify, `channel-${what}:${request.store.id}`, { max, windowSeconds: 3600, message: "That's a lot of tries for one hour — try again a little later." });

  // ── Google & YouTube ─────────────────────────────────────────────
  fastify.register(async (g) => {
    g.addHook("preHandler", installed(googleChannel.APP_KEY));
    g.get("/", async (request) => googleChannel.forAdmin(prisma, request.store, { withStatus: true }));
    g.post("/google-url", async (request) => {
      if (!google.configured()) throw new HttpError(400, "Google sign-in isn't set up on Oyklane yet — add the feed in Merchant Center instead (steps below).");
      await limit(request, "g-connect", 20);
      const state = fastify.jwt.sign({ aud: "google-connect", sid: request.store.id, purpose: "merchant" }, { expiresIn: "15m" });
      return { url: google.authorizeUrl("merchant", state) };
    });
    g.post("/choose", async (request) => {
      const { accountId } = z.object({ accountId: z.string().min(1).max(40) }).parse(request.body || {});
      await googleChannel.chooseAccount(prisma, request.store, accountId);
      return googleChannel.forAdmin(prisma, request.store);
    });
    g.post("/sync", async (request) => {
      await limit(request, "g-sync", 30);
      await googleChannel.sync(prisma, request.store);
      return googleChannel.forAdmin(prisma, request.store, { withStatus: true });
    });
    g.post("/claim-website", async (request) => {
      await limit(request, "g-claim", 20);
      return googleChannel.claimWebsite(prisma, request.store);
    });
    g.delete("/", async (request, reply) => {
      await connections.remove(prisma, request.store.id, googleChannel.APP_KEY);
      reply.code(204);
    });
  }, { prefix: "/google" });

  // ── Facebook & Instagram ─────────────────────────────────────────
  fastify.register(async (f) => {
    f.addHook("preHandler", installed(facebookChannel.APP_KEY));
    f.get("/", async (request) => facebookChannel.forAdmin(prisma, request.store, { withStatus: true }));
    f.post("/facebook-url", async (request) => {
      await limit(request, "fb-connect", 20);
      return { url: facebookChannel.authorizeUrl() };
    });
    // The admin's Facebook callback page posts the code here.
    f.post("/connect", async (request) => {
      const { code } = z.object({ code: z.string().min(5).max(2000) }).parse(request.body || {});
      await limit(request, "fb-connect", 20);
      await facebookChannel.connect(prisma, request.store, code);
      return facebookChannel.forAdmin(prisma, request.store);
    });
    f.post("/catalog", async (request) => {
      const body = z.object({ businessId: z.string().min(1).max(40), catalogId: z.string().max(40).optional(), create: z.boolean().optional() }).parse(request.body || {});
      await limit(request, "fb-catalog", 20);
      await facebookChannel.useCatalog(prisma, request.store, body);
      return facebookChannel.forAdmin(prisma, request.store, { withStatus: true });
    });
    f.post("/sync", async (request) => {
      await limit(request, "fb-sync", 30);
      await facebookChannel.sync(prisma, request.store);
      return facebookChannel.forAdmin(prisma, request.store, { withStatus: true });
    });
    f.delete("/", async (request, reply) => {
      await connections.remove(prisma, request.store.id, facebookChannel.APP_KEY);
      reply.code(204);
    });
  }, { prefix: "/facebook" });

  // ── Domain verification tags (Merchant Center, Meta) ─────────────
  fastify.get("/verification", async (request) => ({ verification: request.store.settings?.verification || {} }));
  fastify.put("/verification", async (request) => {
    const body = z
      .object({
        google: z.string().trim().max(120).optional().nullable(),
        facebook: z.string().trim().max(120).optional().nullable(),
      })
      .parse(request.body || {});
    // People paste the whole tag — keep only the code inside content="…".
    const clean = (v) => {
      if (v == null) return undefined;
      const m = String(v).match(/content=["']([^"']+)["']/);
      const code = (m ? m[1] : String(v)).trim();
      if (code && !CODE.test(code)) throw new HttpError(400, "That doesn't look like a verification code — paste the code (or the whole <meta> tag) the site gave you.");
      return code || null;
    };
    const store = await prisma.store.findUnique({ where: { id: request.store.id }, select: { settings: true } });
    const settings = store.settings && typeof store.settings === "object" ? store.settings : {};
    const verification = { ...(settings.verification || {}) };
    for (const key of ["google", "facebook"]) {
      const v = clean(body[key]);
      if (v !== undefined) verification[key] = v;
    }
    await prisma.store.update({ where: { id: request.store.id }, data: { settings: { ...settings, verification } } });
    return { verification };
  });
}

module.exports = channelRoutes;
