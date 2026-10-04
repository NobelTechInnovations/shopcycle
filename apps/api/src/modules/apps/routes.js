const controller = require("./controller");
const metaService = require("../meta/service");
const facebookAccount = require("../accounts/facebook");

async function appsRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/", controller.listHandler);
  fastify.post("/:key/install", controller.installHandler);
  fastify.post("/:key/uninstall", controller.uninstallHandler);

  // Facebook Pixel: pick one of the pixels on the store's Facebook login
  // (accounts/facebook.js — the one login every Meta app shares).
  fastify.get("/facebook-pixel/connect", async (request) => {
    const account = await facebookAccount.status(fastify.prisma, request.store.id);
    return { configured: account.configured, connectedAs: account.connected ? account.name : null, account };
  });
  fastify.get("/facebook-pixel/pixels", async (request) => {
    const token = await facebookAccount.token(fastify.prisma, request.store.id, "pixel");
    try {
      return { pixels: await metaService.listPixels(token) };
    } catch (err) {
      throw facebookAccount.explain(err, "pixel");
    }
  });
}

module.exports = appsRoutes;
