const controller = require("./controller");

async function shippingRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);

  fastify.get("/zones", controller.listZonesHandler);
  fastify.post("/zones", controller.createZoneHandler);
  fastify.get("/zones/:id", controller.getZoneHandler);
  fastify.patch("/zones/:id", controller.updateZoneHandler);
  fastify.delete("/zones/:id", controller.deleteZoneHandler);

  fastify.post("/zones/:id/rates", controller.addRateHandler);
  fastify.patch("/zones/:id/rates/:rateId", controller.updateRateHandler);
  fastify.delete("/zones/:id/rates/:rateId", controller.deleteRateHandler);
}

module.exports = shippingRoutes;
