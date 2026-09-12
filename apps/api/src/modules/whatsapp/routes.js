const controller = require("./controller");
const appsService = require("../apps/service");

async function whatsappRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);
  fastify.addHook("preHandler", async (request) => {
    await appsService.assertInstalled(request.server.prisma, request.store.id, "whatsapp");
  });

  fastify.get("/templates", controller.templatesHandler);
  fastify.get("/messages", controller.listHandler);
  fastify.post("/messages", controller.sendHandler);
}

module.exports = whatsappRoutes;
