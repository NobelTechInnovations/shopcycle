const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const appsService = require("../apps/service");
const { throttle } = require("../../lib/throttle");
const connections = require("./connections");
const instagram = require("./instagram");
const googleReviews = require("./google-reviews");
const googleAccount = require("../accounts/google");
const facebookAccount = require("../accounts/facebook");

/**
 * /api/social — the Instagram feed and Google reviews apps' own pages:
 * pick the account or business (through the store's one Google / Facebook
 * sign-in, modules/accounts), see what the theme will show, refresh,
 * disconnect. Each only for stores with that app installed.
 */
async function socialRoutes(fastify) {
  const { prisma } = fastify;
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  const installed = (key) => async (request) => appsService.assertInstalled(prisma, request.store.id, key);
  const limit = (request, what, max) =>
    throttle(fastify, `social-${what}:${request.store.id}`, { max, windowSeconds: 3600, message: "That's a lot of tries for one hour — try again a little later." });

  // ── Instagram ───────────────────────────────────────────────────

  fastify.register(async (ig) => {
    ig.addHook("preHandler", installed(instagram.APP_KEY));

    ig.get("/", async (request) => ({
      ...instagram.forAdmin(await connections.get(prisma, request.store.id, instagram.APP_KEY)),
      account: await facebookAccount.status(prisma, request.store.id),
    }));

    /** The Instagram accounts on the store's Facebook login, to pick from. */
    ig.get("/accounts", async (request) => ({ accounts: await instagram.facebookAccounts(prisma, request.store.id) }));

    ig.post("/choose", async (request) => {
      const { igUserId } = z.object({ igUserId: z.string().min(1).max(40) }).parse(request.body || {});
      await limit(request, "ig-connect", 20);
      return instagram.forAdmin(await instagram.useFacebookAccount(prisma, request.store.id, igUserId));
    });

    /** Instagram's own sign-in (the other way in), back to the admin. */
    ig.post("/connect-url", async (request) => {
      if (!instagram.oauthReady()) throw new HttpError(400, "Instagram sign-in isn't set up on Oyklane yet — continue with Facebook instead.");
      const state = fastify.jwt.sign({ aud: "instagram-connect", sid: request.store.id }, { expiresIn: "15m" });
      return { url: instagram.authorizeUrl(state) };
    });

    ig.post("/callback", async (request) => {
      const { code, state } = z.object({ code: z.string().min(5).max(2000), state: z.string().min(10).max(2000) }).parse(request.body || {});
      let payload;
      try {
        payload = fastify.jwt.verify(state);
      } catch {
        throw new HttpError(400, "That Instagram sign-in took too long. Connect again.");
      }
      if (payload.aud !== "instagram-connect" || payload.sid !== request.store.id) throw new HttpError(400, "That Instagram sign-in was for another store. Connect again.");
      await limit(request, "ig-connect", 20);
      return instagram.forAdmin(await instagram.connectWithCode(prisma, request.store.id, code));
    });

    ig.post("/refresh", async (request) => {
      await limit(request, "ig-refresh", 30);
      return instagram.forAdmin(await instagram.refresh(prisma, request.store.id));
    });

    ig.delete("/", async (request, reply) => {
      await connections.remove(prisma, request.store.id, instagram.APP_KEY);
      reply.code(204);
    });
  }, { prefix: "/instagram" });

  // ── Google reviews ──────────────────────────────────────────────

  fastify.register(async (g) => {
    g.addHook("preHandler", installed(googleReviews.APP_KEY));

    g.get("/", async (request) => ({
      ...googleReviews.forAdmin(await connections.get(prisma, request.store.id, googleReviews.APP_KEY)),
      account: await googleAccount.get(prisma, request.store.id),
    }));

    /** The businesses on the store's Google account, to pick from. */
    g.get("/locations", async (request) => ({
      locations: (await googleReviews.locations(prisma, request.store.id)).map((l) => ({ location: l.location, name: l.name, address: l.address })),
    }));

    g.post("/choose", async (request) => {
      const { location } = z.object({ location: z.string().min(5).max(200) }).parse(request.body || {});
      await limit(request, "g-connect", 20);
      return googleReviews.forAdmin(await googleReviews.useLocation(prisma, request.store.id, location));
    });

    // Without a Business Profile sign-in: find the business on Google Maps.
    g.post("/search", async (request) => {
      const { query } = z.object({ query: z.string().max(120) }).parse(request.body || {});
      await limit(request, "g-search", 40);
      return { places: await googleReviews.search(query) };
    });

    g.post("/connect", async (request) => {
      const { placeId } = z.object({ placeId: z.string().min(10).max(300) }).parse(request.body || {});
      await limit(request, "g-connect", 20);
      return googleReviews.forAdmin(await googleReviews.connect(prisma, request.store.id, placeId));
    });

    g.post("/refresh", async (request) => {
      await limit(request, "g-refresh", 20);
      return googleReviews.forAdmin(await googleReviews.refresh(prisma, request.store.id));
    });

    g.delete("/", async (request, reply) => {
      await connections.remove(prisma, request.store.id, googleReviews.APP_KEY);
      reply.code(204);
    });
  }, { prefix: "/google-reviews" });
}

module.exports = socialRoutes;
