const controller = require("./controller");

async function uploadRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.post("/upload", controller.uploadHandler);
  fastify.get("/upload/config", controller.configHandler);
  fastify.post("/upload/sign", controller.signHandler);
  fastify.post("/upload/complete", controller.completeHandler);
  fastify.get("/", controller.listHandler);
  fastify.delete("/:id", controller.deleteHandler);
}

module.exports = uploadRoutes;
