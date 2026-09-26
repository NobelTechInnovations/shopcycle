const controller = require("./controller");
const security = require("./security");
const { recordAudit } = require("../../lib/audit");

// Human-readable audit action names for platform mutations. Anything
// mutating that isn't listed still gets logged, under "METHOD /route" — a
// new endpoint can't silently escape the audit trail by being forgotten
// here.
const AUDIT_ACTIONS = {
  "PATCH /companies/:id/status": "store.status_change",
  "POST /plans": "plan.create",
  "PATCH /plans/:id": "plan.update",
  "DELETE /plans/:id": "plan.delete",
  "POST /apps": "app.create",
  "PATCH /apps/:id": "app.update",
  "DELETE /apps/:id": "app.delete",
};

async function superAdminRoutes(fastify) {
  // Its own cookie, not the seller admin's — see authenticateSuperAdmin's
  // doc comment in plugins/jwt-auth.js.
  fastify.addHook("preHandler", fastify.authenticateSuperAdmin);
  fastify.addHook("preHandler", fastify.requireSuperAdmin);

  // Every successful mutation in the platform console is recorded. The
  // /security routes are excluded here because they audit themselves
  // explicitly (and their bodies carry authenticator codes).
  fastify.addHook("onResponse", async (request, reply) => {
    if (request.method === "GET" || reply.statusCode >= 400) return;
    const route = request.routeOptions?.url?.replace(/^\/api\/super-admin/, "") || request.url;
    if (route.startsWith("/security")) return;
    const key = `${request.method} ${route}`;
    await recordAudit(request, {
      scope: "platform",
      actor: request.currentUser,
      action: AUDIT_ACTIONS[key] || key,
      storeId: route.startsWith("/companies/") ? request.params?.id : undefined,
      targetType: route.split("/")[1] || undefined,
      targetId: request.params?.id,
      metadata: { body: request.body || {} },
    });
  });

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

  // The operator's own account security + the platform audit trail.
  fastify.get("/security", security.getSecurityHandler);
  fastify.post("/security/2fa/setup", security.startTwoFactorSetupHandler);
  fastify.post("/security/2fa/confirm", security.confirmTwoFactorHandler);
  fastify.post("/security/2fa/disable", security.disableTwoFactorHandler);
  fastify.post("/security/sign-out-everywhere", security.signOutEverywhereHandler);
  fastify.get("/audit-logs", security.listAuditLogsHandler);
}

module.exports = superAdminRoutes;
