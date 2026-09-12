const controller = require("./controller");

async function productRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/", controller.listHandler);
  fastify.post("/", controller.createHandler);
  fastify.get("/:id", controller.getHandler);
  fastify.patch("/:id", controller.updateHandler);
  fastify.delete("/:id", controller.deleteHandler);
}

module.exports = productRoutes;
