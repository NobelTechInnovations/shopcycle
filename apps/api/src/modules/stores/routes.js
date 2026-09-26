const controller = require("./controller");

async function storeRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);

  fastify.get("/", controller.getStoreHandler);
  fastify.patch("/", controller.updateStoreHandler);
  fastify.get("/plans", controller.listPlansHandler);
  fastify.post("/plan", controller.switchPlanHandler);

  // Deliberately NOT behind requireActiveSubscription — this is where a
  // blocked store goes to fix that (see jwt-auth.js's requireActiveSubscription).
  fastify.get("/billing", controller.getBillingHandler);
  fastify.post("/subscribe", controller.subscribeHandler);
  fastify.post("/subscribe/verify", controller.subscribeVerifyHandler);
  fastify.delete("/plan/pending", controller.cancelPendingPlanHandler);
  fastify.patch("/billing/details", controller.updateBillingDetailsHandler);
  fastify.get("/invoices/:id", controller.getInvoiceHandler);
}

module.exports = storeRoutes;
