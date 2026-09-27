const { z } = require("zod");
const admin = require("../billing/admin");

/**
 * /api/super-admin/billing — the platform's billing console. Inherits the
 * super-admin auth hooks and the audit log from routes.js.
 */
const reason = z.string().trim().max(500).optional();

async function billingAdminRoutes(fastify) {
  const { prisma } = fastify;
  const actor = (request) => request.currentUser.id;

  fastify.get("/overview", async () => admin.overview(prisma));

  fastify.get("/subscriptions", async (request) => {
    const q = z
      .object({ status: z.string().optional(), q: z.string().max(100).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) })
      .parse(request.query || {});
    return admin.listSubscriptions(prisma, q);
  });

  fastify.get("/subscriptions/:storeId", async (request) => admin.detail(prisma, request.params.storeId));

  const action = (path, schema, fn) =>
    fastify.post(`/subscriptions/:storeId${path}`, async (request) => {
      const body = schema.parse(request.body || {});
      const result = await fn(request, body);
      return { ok: true, result: result ?? null, detail: await admin.detail(prisma, request.params.storeId) };
    });

  action("/suspend", z.object({ reason }), (r, b) => admin.suspend(prisma, r.params.storeId, { ...b, actorId: actor(r) }));
  action("/restore", z.object({ reason }), (r, b) => admin.restore(prisma, r.params.storeId, { ...b, actorId: actor(r) }));
  action("/access", z.object({ until: z.string().nullable().optional(), reason }), (r, b) => admin.grantAccess(prisma, r.params.storeId, { ...b, actorId: actor(r) }));
  action("/extend-trial", z.object({ days: z.coerce.number().int(), reason }), (r, b) => admin.extendTrial(prisma, r.params.storeId, { ...b, actorId: actor(r) }));
  action("/plan", z.object({ planId: z.string().min(1), interval: z.enum(["month", "year"]).optional(), reason }), (r, b) => admin.changePlan(prisma, r.params.storeId, { ...b, actorId: actor(r) }));
  action(
    "/promo",
    z.object({ price: z.union([z.coerce.number(), z.null()]).optional(), cycles: z.union([z.coerce.number().int(), z.null()]).optional(), note: z.string().max(200).optional() }),
    (r, b) => admin.setPromo(prisma, r.params.storeId, { ...b, actorId: actor(r) })
  );
  action("/remind", z.object({}), (r) => admin.remind(prisma, r.params.storeId, { actorId: actor(r) }));
  action("/retry", z.object({}), (r) => admin.retry(prisma, r.params.storeId, { actorId: actor(r), log: r.log }));
  action("/cancel", z.object({ reason }), (r, b) => admin.cancelNow(prisma, r.params.storeId, { ...b, actorId: actor(r), log: r.log }));
  action("/entitlements", z.object({ key: z.string().min(1).max(60), value: z.union([z.boolean(), z.coerce.number()]), expiresAt: z.string().nullable().optional(), reason }), (r, b) =>
    admin.grantEntitlement(prisma, r.params.storeId, { ...b, actorId: actor(r) })
  );

  fastify.post("/subscriptions/:storeId/cycles/:cycleId/waive", async (request) => {
    const body = z.object({ reason }).parse(request.body || {});
    await admin.waiveCycle(prisma, request.params.storeId, request.params.cycleId, { ...body, actorId: actor(request) });
    return { ok: true, detail: await admin.detail(prisma, request.params.storeId) };
  });

  fastify.post("/subscriptions/:storeId/payments/:paymentId/refund", async (request) => {
    const body = z.object({ amount: z.coerce.number().positive().optional(), reason }).parse(request.body || {});
    const result = await admin.refund(prisma, request.params.storeId, request.params.paymentId, { ...body, actorId: actor(request), log: request.log });
    return { ok: true, result, detail: await admin.detail(prisma, request.params.storeId) };
  });

  fastify.delete("/subscriptions/:storeId/entitlements/:grantId", async (request) => {
    await admin.revokeEntitlement(prisma, request.params.storeId, request.params.grantId, { actorId: actor(request) });
    return { ok: true, detail: await admin.detail(prisma, request.params.storeId) };
  });

  fastify.get("/limit-requests", async (request) => ({ requests: await admin.listLimitRequests(prisma, { status: request.query?.status || "pending" }) }));
  fastify.post("/limit-requests/:id", async (request) => {
    const body = z.object({ approve: z.boolean(), value: z.coerce.number().int().positive().optional(), note: z.string().max(500).optional() }).parse(request.body);
    await admin.decideLimitRequest(prisma, request.params.id, { ...body, actorId: actor(request) });
    return { ok: true };
  });

  fastify.get("/settings", async () => ({ settings: await admin.getSettings(prisma, { fresh: true }) }));
  fastify.patch("/settings", async (request) => {
    try {
      return { settings: await admin.saveSettings(prisma, request.body || {}, { actor: actor(request) }) };
    } catch (err) {
      if (err.statusCode === 400) {
        const e = new Error(err.message);
        e.statusCode = 400;
        throw e;
      }
      throw err;
    }
  });

  fastify.get("/plans", async () => admin.featureMatrix(prisma));
  fastify.patch("/plans/:id", async (request) => ({ plan: await admin.updatePlan(prisma, request.params.id, request.body || {}, { actorId: actor(request) }) }));
  fastify.put("/plans/:id/features", async (request) => {
    const body = z.record(z.string(), z.boolean()).parse(request.body || {});
    await admin.setPlanFeatures(prisma, request.params.id, body);
    return admin.featureMatrix(prisma);
  });
}

module.exports = billingAdminRoutes;
