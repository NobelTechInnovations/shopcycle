const controller = require("./controller");

async function dashboardRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);

  fastify.get("/", controller.overviewHandler);
}

module.exports = dashboardRoutes;
