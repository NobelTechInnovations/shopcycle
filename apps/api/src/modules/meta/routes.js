const controller = require("./controller");

/** The shared Facebook connection itself — not gated behind either app's
 * install (see meta-ads/routes.js and whatsapp/routes.js for those), so a
 * merchant can connect once and then install whichever of the two apps
 * they actually want from the Apps page. */
async function metaRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/status", controller.statusHandler);
  fastify.get("/authorize-url", controller.authorizeUrlHandler);
  fastify.post("/connect/exchange", controller.exchangeHandler);
  fastify.get("/assets", controller.assetsHandler);
  fastify.post("/assets/select", controller.selectAssetsHandler);
  fastify.post("/disconnect", controller.disconnectHandler);
}

module.exports = metaRoutes;
