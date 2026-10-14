const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const appsService = require("../apps/service");
const client = require("./client");
const manager = require("./manager");
const publish = require("./publish");
const insights = require("./insights");
const rules = require("./rules");
const spec = require("./spec");

const who = (request) => request.currentUser || request.authUser || null;
const ownerOnly = (request, what) => {
  if (request.storeRole === "staff") throw new HttpError(403, `Only the store owner or an admin can ${what}.`);
};
const TYPES = ["campaign", "adgroup", "ad", "assetgroup"];
const rangeOf = (q) => ({ preset: q.preset, since: q.since, until: q.until });

async function googleAdsRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);
  fastify.addHook("preHandler", fastify.requirePlanFeature("marketing_tools"));
  fastify.addHook("preHandler", async (request) => {
    await appsService.assertInstalled(request.server.prisma, request.store.id, "google-ads");
  });
  const db = fastify.prisma;

  // ── Account ──
  fastify.get("/status", async (request) => {
    const acct = await db.googleAdsAccount.findUnique({ where: { storeId: request.store.id } });
    const install = await db.storeApp.findFirst({ where: { storeId: request.store.id, app: { key: "google-ads" } }, select: { settings: true } });
    return {
      configured: client.configured(),
      account: acct ? { customerId: acct.customerId, name: acct.customerName, currency: acct.currency, via: acct.loginCustomerId, purchaseTracking: Boolean(acct.conversionLabel), merchantId: acct.merchantId } : null,
      // No Google Ads account yet: Oyklane can make one (Super admin set its manager account up).
      canCreate: Boolean((await manager.platformManager(db))?.managerId),
      createdAccount: install?.settings?.createdAccount || null,
    };
  });
  fastify.post("/accounts/create", async (request) => {
    ownerOnly(request, "create a Google Ads account");
    const body = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email("Enter the email that should own the account.") }).parse(request.body || {});
    return manager.createAccount(db, request.store, body);
  });
  fastify.get("/accounts", async (request) => ({ accounts: await manager.accessible(db, request.store) }));
  fastify.post("/accounts/select", async (request) => {
    ownerOnly(request, "choose the Google Ads account");
    const body = z.object({ customerId: z.string().min(10), loginCustomerId: z.string().nullable().optional() }).parse(request.body || {});
    return { account: await manager.choose(db, request.store, body) };
  });
  fastify.delete("/account", async (request) => {
    ownerOnly(request, "disconnect Google Ads");
    return manager.disconnect(db, request.store);
  });
  fastify.get("/capabilities", async (request) => manager.capabilities(db, request.store));
  fastify.post("/conversions/setup", async (request) => {
    ownerOnly(request, "set up purchase tracking");
    return manager.setupConversions(db, request.store);
  });

  // ── Results ──
  fastify.get("/campaigns", async (request) => ({ campaigns: await manager.campaigns(db, request.store, rangeOf(request.query)) }));
  fastify.get("/campaigns/:id/children", async (request) => ({ children: await manager.children(db, request.store, request.params.id, rangeOf(request.query)) }));
  fastify.get("/campaigns/:id/search-terms", async (request) => ({ terms: await manager.searchTerms(db, request.store, request.params.id, rangeOf(request.query)) }));
  fastify.get("/adgroups/:id/ads", async (request) => ({ ads: await manager.ads(db, request.store, request.params.id, rangeOf(request.query)) }));
  fastify.get("/insights", async (request) => insights.overview(db, request.store, rangeOf(request.query), { refresh: request.query.refresh === "1" }));

  // ── Changes ──
  fastify.patch("/:type/:id", async (request) => {
    ownerOnly(request, "change ads");
    if (!TYPES.includes(request.params.type)) throw new HttpError(404, "Not found");
    const body = z.object({ status: z.enum(["ACTIVE", "ENABLED", "PAUSED"]).optional(), name: z.string().min(1).max(255).optional(), budget: z.number().positive().max(1e7).optional() }).parse(request.body || {});
    return manager.update(db, request.store, request.params.type, request.params.id, body, who(request));
  });
  fastify.delete("/:type/:id", async (request) => {
    ownerOnly(request, "delete ads");
    if (!TYPES.includes(request.params.type)) throw new HttpError(404, "Not found");
    return manager.remove(db, request.store, request.params.type, request.params.id, who(request));
  });

  // ── Building a campaign ──
  fastify.get("/targeting/locations", async (request) => ({ results: await manager.searchLocations(db, request.store, String(request.query.q || "")) }));
  fastify.get("/targeting/languages", async (request) => ({ results: await manager.languages(db, request.store) }));
  fastify.post("/keywords/ideas", async (request) => ({ ideas: await manager.keywordIdeas(db, request.store, request.body || {}) }));
  fastify.post("/ai/copy", async (request) => insights.copyIdeas(db, request.store, request.body || {}));
  fastify.post("/check", async (request) => publish.validate(db, request.store, request.body || {}));
  fastify.get("/drafts", async (request) => ({ drafts: await publish.listDrafts(db, request.store.id) }));
  fastify.get("/drafts/:id", async (request) => ({ draft: await publish.getDraft(db, request.store.id, request.params.id) }));
  fastify.post("/drafts", async (request, reply) => {
    const body = z.object({ data: z.record(z.any()) }).parse(request.body || {});
    reply.code(201).send({ draft: await publish.saveDraft(db, request.store, { data: body.data }, who(request)) });
  });
  fastify.put("/drafts/:id", async (request) => {
    const body = z.object({ data: z.record(z.any()) }).parse(request.body || {});
    return { draft: await publish.saveDraft(db, request.store, { id: request.params.id, data: body.data }, who(request)) };
  });
  fastify.delete("/drafts/:id", async (request) => publish.deleteDraft(db, request.store.id, request.params.id));
  fastify.post("/drafts/:id/publish", async (request) => {
    ownerOnly(request, "publish ads");
    const { confirm } = z.object({ confirm: z.literal(true) }).parse(request.body || {});
    return publish.publish(db, request.store, request.params.id, who(request), { confirm });
  });
  fastify.post("/drafts/:id/launch", async (request) => {
    ownerOnly(request, "turn ads on");
    const { confirm } = z.object({ confirm: z.literal(true) }).parse(request.body || {});
    return publish.launch(db, request.store, request.params.id, who(request), { confirm });
  });

  // ── Images ──
  fastify.get("/media", async (request) => ({ media: await manager.library(db, request.store) }));
  fastify.post("/media", async (request, reply) => {
    const file = await request.file({ limits: { fileSize: 5 * 1024 * 1024 } });
    if (!file) throw new HttpError(400, "Choose an image.");
    reply.code(201).send({ media: await manager.uploadImage(db, request.store, { buffer: await file.toBuffer(), mime: file.mimetype, name: file.filename }) });
  });

  // ── Recommendations, rules, activity ──
  fastify.post("/recommendations/apply", async (request) => {
    ownerOnly(request, "change ads");
    const rec = z.object({ type: z.enum(["pause", "budget", "negative"]), targetType: z.string(), targetId: z.string().min(1), targetName: z.string().optional(), change: z.object({ from: z.number().optional(), to: z.number().optional(), status: z.string().optional(), keyword: z.string().optional() }) }).parse(request.body || {});
    return insights.applyRecommendation(db, request.store, rec, who(request));
  });
  fastify.post("/google-recommendations", async (request) => {
    ownerOnly(request, "change ads");
    const body = z.object({ resourceName: z.string().min(10), action: z.enum(["apply", "dismiss"]) }).parse(request.body || {});
    return manager.actOnGoogleRecommendation(db, request.store, body, who(request));
  });
  fastify.get("/rules", async (request) => ({ rules: await rules.list(db, request.store.id), kinds: rules.KINDS }));
  fastify.post("/rules", async (request, reply) => {
    ownerOnly(request, "set up automatic rules");
    reply.code(201).send({ rule: await rules.save(db, request.store, request.body || {}, who(request)) });
  });
  fastify.put("/rules/:id", async (request) => {
    ownerOnly(request, "change automatic rules");
    return { rule: await rules.save(db, request.store, request.body || {}, who(request), request.params.id) };
  });
  fastify.delete("/rules/:id", async (request) => {
    ownerOnly(request, "delete automatic rules");
    return rules.remove(db, request.store.id, request.params.id);
  });
  fastify.post("/rules/:id/preview", async (request) => {
    const rule = await db.adRule.findFirst({ where: { id: request.params.id, storeId: request.store.id, platform: "google" } });
    if (!rule) throw new HttpError(404, "Rule not found");
    return { changes: await rules.run(db, rule, { dryRun: true }) };
  });
  fastify.get("/activity", async (request) => ({ activity: await db.adActivity.findMany({ where: { storeId: request.store.id, platform: "google" }, orderBy: { createdAt: "desc" }, take: 200 }) }));
  fastify.get("/spec", async () => ({ types: spec.TYPES, bidding: spec.BIDDING, matchTypes: spec.MATCH_TYPES }));
}

module.exports = googleAdsRoutes;
