const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const appsService = require("../apps/service");
const connections = require("../social/connections");
const { throttle } = require("../../lib/throttle");
const googleChannel = require("./google");
const facebookChannel = require("./facebook");
const analytics = require("./google-analytics");

const CODE = /^[A-Za-z0-9_\-:.]{4,120}$/;

/**
 * /api/channels — the Google & YouTube and Facebook & Instagram sales
 * channels: pick the seller's Merchant Center / catalog (through the
 * store's one Google / Facebook sign-in, modules/accounts), sync, status,
 * and the domain verification tags both ask for.
 */
async function channelRoutes(fastify) {
  const { prisma } = fastify;
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  const installed = (key) => async (request) => appsService.assertInstalled(prisma, request.store.id, key);
  const limit = (request, what, max = 30) => throttle(fastify, `channel-${what}:${request.store.id}`, { max, windowSeconds: 3600, message: "That's a lot of tries for one hour — try again a little later." });

  // ── Google Analytics & Tag Manager (google-analytics.js) ─────────
  fastify.register(async (g) => {
    g.addHook("preHandler", installed(analytics.APP_KEY));
    const id = z.string().min(3).max(120);
    g.get("/", async (request) => analytics.forAdmin(prisma, request.store));
    g.get("/accounts", async (request) => ({ accounts: await analytics.analyticsAccounts(prisma, request.store.id) }));
    g.get("/streams", async (request) => ({ streams: await analytics.streams(prisma, request.store.id, z.object({ property: id }).parse(request.query).property) }));
    g.post("/streams", async (request) => {
      await limit(request, "ga-create", 10);
      const { property } = z.object({ property: id }).parse(request.body || {});
      return { stream: await analytics.createStream(prisma, request.store, property) };
    });
    g.post("/use", async (request) => {
      const body = z.object({ property: id, propertyName: z.string().max(200).optional(), measurementId: z.string().max(40) }).parse(request.body || {});
      await analytics.useStream(prisma, request.store, body);
      return analytics.forAdmin(prisma, request.store);
    });
    g.post("/properties", async (request) => {
      await limit(request, "ga-create", 10);
      await analytics.createProperty(prisma, request.store, z.object({ account: id }).parse(request.body || {}).account);
      return analytics.forAdmin(prisma, request.store);
    });
    g.post("/signup", async (request) => {
      await limit(request, "ga-signup", 10);
      return analytics.signUpUrl(prisma, request.store);
    });
    g.post("/ads", async (request) => {
      await limit(request, "ga-ads", 10);
      await analytics.linkAds(prisma, request.store, (request.body || {}).customerId);
      return analytics.forAdmin(prisma, request.store);
    });
    g.get("/gtm", async (request) => ({ accounts: await analytics.gtmContainers(prisma, request.store.id) }));
    g.post("/gtm/use", async (request) => {
      await analytics.useContainer(prisma, request.store, z.object({ id: z.string().max(20), name: z.string().max(200).optional() }).parse(request.body || {}));
      return analytics.forAdmin(prisma, request.store);
    });
    g.post("/gtm/create", async (request) => {
      await limit(request, "gtm-create", 10);
      await analytics.createContainer(prisma, request.store, z.object({ account: id }).parse(request.body || {}).account);
      return analytics.forAdmin(prisma, request.store);
    });
    g.put("/manual", async (request) => {
      await analytics.saveManual(prisma, request.store, request.body);
      return analytics.forAdmin(prisma, request.store);
    });
  }, { prefix: "/google-analytics" });

  // ── Google & YouTube ─────────────────────────────────────────────
  fastify.register(async (g) => {
    g.addHook("preHandler", installed(googleChannel.APP_KEY));
    g.get("/", async (request) => googleChannel.forAdmin(prisma, request.store, { withStatus: true }));
    /** Merchant Center accounts on the store's Google account. */
    g.get("/accounts", async (request) => ({ accounts: await googleChannel.accounts(prisma, request.store.id) }));
    g.post("/choose", async (request) => {
      const { accountId } = z.object({ accountId: z.string().min(1).max(40) }).parse(request.body || {});
      await limit(request, "g-connect", 20);
      await googleChannel.useAccount(prisma, request.store, accountId);
      return googleChannel.forAdmin(prisma, request.store, { withStatus: true });
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
    /** Businesses and catalogs on the store's Facebook login. */
    f.get("/catalogs", async (request) => ({ businesses: await facebookChannel.catalogs(prisma, request.store) }));
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
