const { env } = require("../../config/env");
const controller = require("./controller");
const security = require("./security");
const { overview } = require("./overview");
const { recordAudit } = require("../../lib/audit");
const billingAdmin = require("./billing");
const messagingAdmin = require("./messaging");
const supportAdmin = require("./support");

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
  "POST /billing/subscriptions/:storeId/suspend": "billing.suspend",
  "POST /billing/subscriptions/:storeId/restore": "billing.restore",
  "POST /billing/subscriptions/:storeId/access": "billing.grant_access",
  "POST /billing/subscriptions/:storeId/free-plan": "billing.free_plan",
  "POST /billing/subscriptions/:storeId/extend-trial": "billing.extend_trial",
  "POST /billing/subscriptions/:storeId/plan": "billing.change_plan",
  "POST /billing/subscriptions/:storeId/promo": "billing.promo",
  "POST /billing/subscriptions/:storeId/remind": "billing.remind",
  "POST /billing/subscriptions/:storeId/retry": "billing.retry",
  "POST /billing/subscriptions/:storeId/cancel": "billing.cancel",
  "POST /billing/subscriptions/:storeId/cycles/:cycleId/waive": "billing.waive",
  "POST /billing/subscriptions/:storeId/payments/:paymentId/refund": "billing.refund",
  "POST /billing/subscriptions/:storeId/entitlements": "billing.entitlement_grant",
  "DELETE /billing/subscriptions/:storeId/entitlements/:grantId": "billing.entitlement_revoke",
  "POST /billing/limit-requests/:id": "billing.limit_request",
  "PATCH /billing/settings": "billing.settings",
  "PATCH /billing/plans/:id": "billing.plan_update",
  "PUT /billing/plans/:id/features": "billing.plan_features",
  "PUT /messaging/templates": "messaging.templates",
  "POST /messaging/test": "messaging.test_send",
  "POST /support/tickets/:id/reply": "support.reply",
  "PATCH /support/tickets/:id": "support.ticket_update",
  "POST /support/articles": "support.article_create",
  "PATCH /support/articles/:id": "support.article_update",
  "DELETE /support/articles/:id": "support.article_delete",
  "PUT /support/settings": "support.settings",
};

/** Asks the marketing site to show the new prices (fire and forget). */
function refreshMarketingSite(log) {
  if (!env.WWW_REVALIDATE_URL || !env.REVALIDATE_SECRET) return;
  fetch(env.WWW_REVALIDATE_URL, { method: "POST", headers: { authorization: `Bearer ${env.REVALIDATE_SECRET}` }, signal: AbortSignal.timeout(8000) }).catch((err) =>
    log?.warn({ err: err.message }, "couldn't refresh the marketing site's prices")
  );
}

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
    // Plans or pricing changed: the marketing site's prices refresh now.
    if (/^\/(billing\/)?(plans|settings)/.test(route)) refreshMarketingSite(request.log);
    const key = `${request.method} ${route}`;
    await recordAudit(request, {
      scope: "platform",
      actor: request.currentUser,
      action: AUDIT_ACTIONS[key] || key,
      storeId: route.startsWith("/companies/") ? request.params?.id : request.params?.storeId,
      targetType: route.split("/")[1] || undefined,
      targetId: request.params?.id,
      metadata: { body: request.body || {} },
    });
  });

  fastify.get("/overview", async (request) => overview(request.server.prisma));
  fastify.get("/companies", controller.listCompaniesHandler);
  fastify.patch("/companies/:id/status", controller.updateCompanyStatusHandler);

  fastify.get("/plans", controller.listPlansHandler);
  fastify.post("/plans", controller.createPlanHandler);
  fastify.patch("/plans/:id", controller.updatePlanHandler);
  fastify.delete("/plans/:id", controller.deletePlanHandler);

  // Billing engine controls (billing/admin.js).
  fastify.register(billingAdmin, { prefix: "/billing" });

  // WhatsApp templates shared by every store (messaging.js).
  fastify.register(messagingAdmin, { prefix: "/messaging" });

  // Seller tickets, help articles and the Help assistant (support.js).
  fastify.register(supportAdmin, { prefix: "/support" });

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
