const controller = require("./controller");

/** The current store's own settings. Billing lives in modules/billing
 * (/api/billing). */
async function storeRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);

  fastify.get("/", controller.getStoreHandler);
  fastify.patch("/", controller.updateStoreHandler);
}

module.exports = storeRoutes;
