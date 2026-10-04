const { HttpError } = require("@shopcycle/utils");
const controller = require("./controller");
const policies = require("./policies");

async function pageRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/", controller.listHandler);
  // Settings ▸ Policies: the four standard policies, each created from a template.
  fastify.get("/policies", async (request) => ({ policies: await policies.list(fastify.prisma, request.store) }));
  fastify.post("/policies/:key", async (request) => {
    const page = await policies.create(fastify.prisma, request.store, request.params.key);
    if (!page) throw new HttpError(404, "Unknown policy");
    return { page };
  });
  fastify.post("/", controller.createHandler);
  fastify.get("/:id", controller.getHandler);
  fastify.patch("/:id", controller.updateHandler);
  fastify.delete("/:id", controller.deleteHandler);
}

module.exports = pageRoutes;
