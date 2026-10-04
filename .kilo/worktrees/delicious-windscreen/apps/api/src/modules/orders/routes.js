const controller = require("./controller");

async function orderRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/", controller.listHandler);
  fastify.post("/", controller.createHandler);
  // Static paths first — they'd otherwise read as an order id.
  fastify.get("/couriers", controller.couriersHandler);
  fastify.get("/abandoned", controller.abandonedHandler);
  fastify.get("/returns", controller.returnsListHandler);

  fastify.get("/:id", controller.getHandler);
  fastify.patch("/:id/status", controller.updateStatusHandler);
  fastify.get("/:id/status-link", controller.statusLinkHandler);
  fastify.get("/:id/insights", controller.insightsHandler);
  fastify.post("/:id/fulfillments", controller.fulfillHandler);
  fastify.post("/:id/fulfillments/:fulfillmentId", controller.fulfillmentActionHandler);
  fastify.post("/:id/mark-paid", controller.markPaidHandler);
  fastify.post("/:id/cancel", controller.cancelHandler);
  fastify.post("/:id/refunds", controller.refundHandler);
  fastify.post("/:id/notes", controller.noteHandler);
  fastify.post("/:id/resend-confirmation", { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, controller.resendConfirmationHandler);
  fastify.post("/:id/returns", controller.createReturnHandler);
  fastify.post("/:id/returns/:returnId", controller.returnActionHandler);
  fastify.post("/:id/invoice", controller.issueInvoiceHandler);
  fastify.get("/:id/invoice", controller.getInvoiceHandler);
}

module.exports = orderRoutes;
