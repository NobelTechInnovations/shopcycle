const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const service = require("./service");
const subscriptions = require("./subscriptions");
const planChange = require("./plan-change");
const commission = require("./commission");
const engine = require("./engine");
const charges = require("./charges");
const { METHODS } = require("./mandates");

/**
 * The seller's billing API (/api/billing). Reachable even while the
 * dashboard is locked — this is where a locked store pays (see the
 * allowlist in plugins/jwt-auth.js). Staff can look; only owners and
 * admins can pay or change anything.
 */
function assertCanManage(request) {
  if (request.storeRole === "staff") throw new HttpError(403, "Only the store owner or an admin can change billing.");
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const detailsSchema = z.object({
  billingName: z.string().trim().max(160).optional().nullable(),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(GSTIN, "Enter a valid 15-character GSTIN, e.g. 27ABCDE1234F1Z5")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  billingAddress: z.string().trim().max(500).optional().nullable(),
  billingState: z.string().trim().max(60).optional().nullable(),
});
const planSchema = z.object({ planId: z.string().min(1), interval: z.enum(["month", "year"]).optional() });
const checkoutSchema = z.object({ planId: z.string().optional(), interval: z.enum(["month", "year"]).optional(), method: z.enum(METHODS).optional() });
const verifySchema = z.object({ orderId: z.string().min(1), paymentId: z.string().min(1), signature: z.string().min(1) });
const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), month: z.string().regex(/^\d{4}-\d{2}$/).optional() });

async function billingRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  const { prisma } = fastify;

  fastify.get("/", async (request) => service.overview(prisma, request.store, { log: request.log }));

  // What the admin shell's billing banner needs — cheap, loaded on every page.
  fastify.get("/status", async (request) => {
    const sub = request.subscription;
    const [notice, mandate] = await Promise.all([
      prisma.billingNotification.findFirst({
        where: { storeId: request.store.id, readAt: null, severity: { in: ["warning", "danger"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, title: true, body: true, severity: true, createdAt: true },
      }),
      sub ? charges.activeMandate(prisma, sub.id) : null,
    ]);
    return {
      status: sub?.status || null,
      planName: sub?.plan?.name || null,
      autopay: Boolean(mandate),
      access: request.access,
      trialEndsAt: sub?.trialEndsAt || null,
      graceEndsAt: sub?.graceEndsAt || null,
      nextBillingAt: sub?.nextBillingAt || null,
      currentPeriodEnd: sub?.currentPeriodEnd || null,
      autoRenew: sub?.autoRenew ?? true,
      notice,
    };
  });

  fastify.get("/plans", async (request) => ({ plans: await service.listPlans(prisma, { store: request.store }) }));

  fastify.post("/plan/preview", async (request) => {
    const body = planSchema.parse(request.body);
    const sub = await subscriptions.forStore(prisma, request.store);
    return { preview: await planChange.preview(prisma, request.store, sub, body) };
  });

  fastify.post("/plan", async (request) => {
    assertCanManage(request);
    const body = planSchema.parse(request.body);
    const sub = await subscriptions.forStore(prisma, request.store);
    const result = await planChange.change(prisma, request.store, sub, { ...body, actorId: request.currentUser.id, log: request.log });
    return { result, billing: await service.overview(prisma, request.store) };
  });

  // First visit after sign-up (/welcome): the owner confirms the plan the
  // trial runs on. Switching during the trial is free (plan-change.js);
  // keeping the default plan just clears the flag.
  fastify.post("/setup/plan", async (request) => {
    assertCanManage(request);
    const body = planSchema.parse(request.body);
    const sub = await subscriptions.forStore(prisma, request.store);
    if (sub.planId !== body.planId || (body.interval && body.interval !== sub.interval)) {
      await planChange.change(prisma, request.store, sub, { ...body, actorId: request.currentUser.id, log: request.log });
    }
    const store = await prisma.store.findUnique({ where: { id: request.store.id }, select: { settings: true } });
    const { setup, ...settings } = store.settings || {};
    if (setup) await prisma.store.update({ where: { id: request.store.id }, data: { settings } });
    return { billing: await service.overview(prisma, request.store) };
  });

  fastify.delete("/plan/pending", async (request) => {
    assertCanManage(request);
    const sub = await subscriptions.forStore(prisma, request.store);
    if (!sub.pendingPlanId && !sub.pendingInterval) throw new HttpError(400, "There's no scheduled plan change to cancel.");
    await planChange.change(prisma, request.store, sub, { planId: sub.planId, interval: sub.interval, actorId: request.currentUser.id });
    return { billing: await service.overview(prisma, request.store) };
  });

  // Complete the subscription / pay what's due.
  fastify.post("/checkout", async (request) => {
    assertCanManage(request);
    const body = checkoutSchema.parse(request.body || {});
    const result = await service.startCheckout(prisma, request.store, request.currentUser, { ...body, log: request.log });
    return { ...result, billing: result.completed ? await service.overview(prisma, request.store) : undefined };
  });

  fastify.post("/checkout/verify", async (request) => {
    assertCanManage(request);
    const body = verifySchema.parse(request.body);
    const result = await service.verifyCheckout(prisma, request.store, body, { log: request.log });
    return { ...result, billing: await service.overview(prisma, request.store) };
  });

  // Replace the autopay method.
  fastify.post("/mandate", async (request) => {
    assertCanManage(request);
    const { method } = z.object({ method: z.enum(METHODS) }).parse(request.body);
    const result = await service.replaceMandate(prisma, request.store, request.currentUser, { method, log: request.log });
    return { ...result, billing: result.completed ? await service.overview(prisma, request.store) : undefined };
  });

  fastify.post("/cancel", async (request) => {
    assertCanManage(request);
    const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(request.body || {});
    const sub = await subscriptions.forStore(prisma, request.store);
    await subscriptions.cancel(prisma, request.store, sub, { reason, actorId: request.currentUser.id, log: request.log });
    return { billing: await service.overview(prisma, request.store) };
  });

  fastify.post("/resume", async (request) => {
    assertCanManage(request);
    const sub = await subscriptions.forStore(prisma, request.store);
    await subscriptions.resume(prisma, request.store, sub, { actorId: request.currentUser.id });
    return { billing: await service.overview(prisma, request.store) };
  });

  fastify.get("/invoices", async (request) => service.listInvoices(prisma, request.store.id, pageSchema.parse(request.query || {})));

  fastify.get("/invoices/:id", async (request) => {
    const invoice = await prisma.platformInvoice.findFirst({ where: { id: request.params.id, storeId: request.store.id } });
    if (!invoice) throw new HttpError(404, "Invoice not found");
    return { invoice };
  });

  fastify.get("/payments", async (request) => service.listPayments(prisma, request.store.id, pageSchema.parse(request.query || {})));

  fastify.get("/commissions", async (request) => {
    const q = pageSchema.parse(request.query || {});
    return service.listCommissions(prisma, request.store.id, q);
  });

  fastify.get("/commissions/summary", async (request) => commission.feeSummary(prisma, request.store.id));

  fastify.patch("/details", async (request) => {
    assertCanManage(request);
    const data = detailsSchema.parse(request.body);
    const store = await prisma.store.update({ where: { id: request.store.id }, data });
    return { billingDetails: { billingName: store.billingName, gstin: store.gstin, billingAddress: store.billingAddress, billingState: store.billingState } };
  });

  fastify.post("/limit-request", async (request, reply) => {
    assertCanManage(request);
    const body = z.object({ requested: z.coerce.number().int(), reason: z.string().max(1000).optional() }).parse(request.body);
    const row = await service.requestLimit(prisma, request.store, body);
    reply.code(201).send({ request: row });
  });

  fastify.get("/limit-requests", async (request) => ({
    requests: await prisma.limitRequest.findMany({ where: { storeId: request.store.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  }));

  fastify.get("/notifications", async (request) => ({
    notifications: await prisma.billingNotification.findMany({ where: { storeId: request.store.id }, orderBy: { createdAt: "desc" }, take: 50 }),
  }));

  fastify.post("/notifications/read", async (request) => {
    const { ids } = z.object({ ids: z.array(z.string()).max(100).optional() }).parse(request.body || {});
    await prisma.billingNotification.updateMany({ where: { storeId: request.store.id, readAt: null, ...(ids && { id: { in: ids } }) }, data: { readAt: new Date() } });
    return { ok: true };
  });

  // Test clock — runs the engine for this store as if it were `now`.
  // Development/test only; refused unless BILLING_TEST_CLOCK=true and
  // never in production.
  if (env.BILLING_TEST_CLOCK && env.NODE_ENV !== "production") {
    fastify.post("/_test/clock", async (request) => {
      const { now } = z.object({ now: z.coerce.date() }).parse(request.body);
      const ran = await engine.runBilling(prisma, { now, storeId: request.store.id, log: request.log });
      const reminders = await engine.sendReminders(prisma, { now, storeId: request.store.id, log: request.log });
      return { ran, reminders, billing: await service.overview(prisma, request.store) };
    });
  }
}

module.exports = billingRoutes;
