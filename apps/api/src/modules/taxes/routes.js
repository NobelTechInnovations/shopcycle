const controller = require("./controller");

async function taxRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);

  fastify.get("/", controller.listHandler);
  fastify.post("/", controller.createHandler);
  fastify.patch("/:id", controller.updateHandler);
  fastify.delete("/:id", controller.deleteHandler);
}

module.exports = taxRoutes;
