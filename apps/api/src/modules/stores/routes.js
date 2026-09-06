const controller = require("./controller");

async function storeRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);

  fastify.get("/", controller.getStoreHandler);
  fastify.patch("/", controller.updateStoreHandler);
  fastify.get("/plans", controller.listPlansHandler);
  fastify.post("/plan", controller.switchPlanHandler);
}

module.exports = storeRoutes;
