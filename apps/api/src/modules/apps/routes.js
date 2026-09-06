const controller = require("./controller");

async function appsRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);

  fastify.get("/", controller.listHandler);
  fastify.post("/:key/install", controller.installHandler);
  fastify.post("/:key/uninstall", controller.uninstallHandler);
}

module.exports = appsRoutes;
