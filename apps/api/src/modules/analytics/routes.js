const controller = require("./controller");

async function analyticsRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/live", controller.liveHandler);
  fastify.get("/overview", controller.overviewHandler);
  fastify.get("/reports", controller.reportsHandler);
  fastify.get("/campaigns", controller.listCampaignsHandler);
  fastify.post("/campaigns", controller.createCampaignHandler);
  fastify.delete("/campaigns/:id", controller.deleteCampaignHandler);
}

module.exports = analyticsRoutes;
