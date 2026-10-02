const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const appsService = require("../apps/service");
const { throttle } = require("../../lib/throttle");
const connections = require("./connections");
const instagram = require("./instagram");
const googleReviews = require("./google-reviews");
const google = require("../../lib/google-api");

/**
 * /api/social — the Instagram feed and Google reviews apps' own pages:
 * connect the account or business, see what the theme will show, refresh,
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

    ig.get("/", async (request) => instagram.forAdmin(await connections.get(prisma, request.store.id, instagram.APP_KEY)));

    /** Where "Connect Instagram" goes: Instagram's sign-in, back to the admin. */
    ig.post("/connect-url", async (request) => {
      if (!instagram.oauthReady()) throw new HttpError(400, "One-click Instagram sign-in isn't set up on Oyklane yet — paste an access token instead.");
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

    /** Continue with Facebook: the Instagram account linked to a Page. */
    ig.post("/facebook-url", async (request) => {
      await limit(request, "ig-connect", 20);
      return { url: instagram.facebookAuthorizeUrl() };
    });

    // The admin's Facebook callback page posts the code here (the session
    // says which store — the same as the Meta Ads connection).
    ig.post("/facebook", async (request) => {
      const { code } = z.object({ code: z.string().min(5).max(2000) }).parse(request.body || {});
      await limit(request, "ig-connect", 20);
      return instagram.forAdmin(await instagram.connectWithFacebook(prisma, request.store.id, code));
    });

    ig.post("/choose", async (request) => {
      const { igUserId } = z.object({ igUserId: z.string().min(1).max(40) }).parse(request.body || {});
      return instagram.forAdmin(await instagram.chooseFacebookAccount(prisma, request.store.id, igUserId));
    });

    ig.post("/token", async (request) => {
      const { accessToken } = z.object({ accessToken: z.string().min(20).max(600) }).parse(request.body || {});
      await limit(request, "ig-connect", 20);
      return instagram.forAdmin(await instagram.connectWithToken(prisma, request.store.id, accessToken));
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

    g.get("/", async (request) => googleReviews.forAdmin(await connections.get(prisma, request.store.id, googleReviews.APP_KEY)));

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

    /** Sign in with Google: the Business Profile's reviews. */
    g.post("/google-url", async (request) => {
      if (!google.configured()) throw new HttpError(400, "Google sign-in isn't set up on Oyklane yet — find your business by name below.");
      await limit(request, "g-connect", 20);
      const state = fastify.jwt.sign({ aud: "google-connect", sid: request.store.id, purpose: "reviews" }, { expiresIn: "15m" });
      return { url: google.authorizeUrl("reviews", state) };
    });

    g.post("/choose", async (request) => {
      const { location } = z.object({ location: z.string().min(5).max(200) }).parse(request.body || {});
      return googleReviews.forAdmin(await googleReviews.chooseLocation(prisma, request.store.id, location));
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

  // ── Google sign-in callback (reviews and the shopping channel) ──

  /** The admin's /admin/apps/google/callback page posts Google's code and
   * state here; the state says which store and which app asked. */
  fastify.post("/google/callback", async (request) => {
    const { code, state } = z.object({ code: z.string().min(5).max(2000), state: z.string().min(10).max(2000) }).parse(request.body || {});
    let payload;
    try {
      payload = fastify.jwt.verify(state);
    } catch {
      throw new HttpError(400, "That Google sign-in took too long. Connect again.");
    }
    if (payload.aud !== "google-connect" || payload.sid !== request.store.id) throw new HttpError(400, "That Google sign-in was for another store. Connect again.");
    await limit(request, "g-connect", 20);
    if (payload.purpose === "reviews") {
      await appsService.assertInstalled(prisma, request.store.id, googleReviews.APP_KEY);
      return { redirect: "/admin/apps/google-reviews", result: googleReviews.forAdmin(await googleReviews.connectWithGoogle(prisma, request.store.id, code)) };
    }
    if (payload.purpose === "merchant") {
      const channel = require("../channels/google");
      await appsService.assertInstalled(prisma, request.store.id, channel.APP_KEY);
      await channel.connectWithGoogle(prisma, request.store, code);
      return { redirect: "/admin/apps/google-shopping" };
    }
    throw new HttpError(400, "Unknown Google connection");
  });
}

module.exports = socialRoutes;
