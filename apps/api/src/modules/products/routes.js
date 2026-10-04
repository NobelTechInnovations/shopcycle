const controller = require("./controller");

async function productRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/", controller.listHandler);
  fastify.post("/", controller.createHandler);
  fastify.post("/bulk", controller.bulkHandler);
  fastify.get("/tags", controller.tagsHandler);
  // Product types and vendors in use — the products list's filters.
  fastify.get("/facets", async (request) => require("./service").listFacets(request.server.prisma, request.store.id));
  fastify.post("/ai/description", controller.aiDescriptionHandler);
  fastify.post("/ai/suggest", controller.aiSuggestHandler);
  fastify.get("/:id", controller.getHandler);
  fastify.patch("/:id", controller.updateHandler);
  fastify.delete("/:id", controller.deleteHandler);
}

module.exports = productRoutes;
