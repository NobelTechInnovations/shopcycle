const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const controller = require("./controller");
const metaService = require("../meta/service");
const metaRepository = require("../meta/repository");

// Facebook login just to find the store's Pixel — every plan (the full
// Meta connection for ads and WhatsApp stays Premium, see meta/routes.js).
const PIXEL_SCOPES = ["ads_read", "business_management"];

async function appsRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/", controller.listHandler);
  fastify.post("/:key/install", controller.installHandler);
  fastify.post("/:key/uninstall", controller.uninstallHandler);

  // Facebook Pixel: "Continue with Facebook" → pick a pixel, no copying ids.
  fastify.get("/facebook-pixel/connect", async (request) => {
    const configured = metaService.metaConfigured();
    const connection = configured ? await metaRepository.findByStore(fastify.prisma, request.store.id) : null;
    return {
      configured,
      connectedAs: connection?.facebookUserName || null,
      authorizeUrl: configured ? metaService.buildAuthorizeUrl(PIXEL_SCOPES) : null,
    };
  });
  fastify.post("/facebook-pixel/connect", async (request) => {
    if (!metaService.metaConfigured()) throw new HttpError(400, "Facebook login isn't set up on this platform yet — enter the Pixel ID instead.");
    const { code } = z.object({ code: z.string().min(1).max(2000) }).parse(request.body);
    const { accessToken, expiresAt } = await metaService.exchangeCodeForLongLivedToken(code);
    const profile = await metaService.fetchProfile(accessToken);
    await metaRepository.upsert(fastify.prisma, request.store.id, { accessToken, tokenExpiresAt: expiresAt, facebookUserId: profile.id, facebookUserName: profile.name });
    return { connectedAs: profile.name };
  });
  fastify.get("/facebook-pixel/pixels", async (request) => {
    const connection = await metaRepository.findByStore(fastify.prisma, request.store.id);
    if (!connection) throw new HttpError(400, "Continue with Facebook first.");
    return { pixels: await metaService.listPixels(connection.accessToken) };
  });
}

module.exports = appsRoutes;
