const controller = require("./controller");

async function orderRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/", controller.listHandler);
  fastify.post("/", controller.createHandler);
  fastify.get("/:id", controller.getHandler);
  fastify.patch("/:id/status", controller.updateStatusHandler);
}

module.exports = orderRoutes;
