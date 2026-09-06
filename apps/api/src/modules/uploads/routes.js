const controller = require("./controller");

async function uploadRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);

  fastify.post("/upload", controller.uploadHandler);
  fastify.get("/", controller.listHandler);
  fastify.delete("/:id", controller.deleteHandler);
}

module.exports = uploadRoutes;
