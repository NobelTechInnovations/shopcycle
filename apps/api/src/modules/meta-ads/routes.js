const controller = require("./controller");
const appsService = require("../apps/service");

async function metaAdsRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);
  // Distinct from requireActiveSubscription — this is "did the merchant
  // actually install this specific app," checked per request rather than
  // once at install time so uninstalling it takes effect immediately.
  fastify.addHook("preHandler", async (request) => {
    await appsService.assertInstalled(request.server.prisma, request.store.id, "meta-ads");
  });

  fastify.get("/objectives", controller.objectivesHandler);
  fastify.get("/campaigns", controller.listHandler);
  fastify.post("/campaigns", controller.createHandler);
  fastify.post("/campaigns/:id/status", controller.statusHandler);
}

module.exports = metaAdsRoutes;
