const controller = require("./controller");

async function superAdminRoutes(fastify) {
  // Its own cookie, not the seller admin's — see authenticateSuperAdmin's
  // doc comment in plugins/jwt-auth.js.
  fastify.addHook("preHandler", fastify.authenticateSuperAdmin);
  fastify.addHook("preHandler", fastify.requireSuperAdmin);

  fastify.get("/companies", controller.listCompaniesHandler);
  fastify.patch("/companies/:id/status", controller.updateCompanyStatusHandler);

  fastify.get("/plans", controller.listPlansHandler);
  fastify.post("/plans", controller.createPlanHandler);
  fastify.patch("/plans/:id", controller.updatePlanHandler);
  fastify.delete("/plans/:id", controller.deletePlanHandler);

  fastify.get("/apps", controller.listAppsHandler);
  fastify.post("/apps", controller.createAppHandler);
  fastify.patch("/apps/:id", controller.updateAppHandler);
  fastify.delete("/apps/:id", controller.deleteAppHandler);
}

module.exports = superAdminRoutes;
