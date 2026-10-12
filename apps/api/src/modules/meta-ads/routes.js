const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const appsService = require("../apps/service");
const manager = require("./manager");
const publish = require("./publish");
const insights = require("./insights");
const rules = require("./rules");
const spec = require("./spec");

const who = (request) => request.currentUser || request.authUser || null;
/** Anything that can spend money or change live ads: owner and admins. */
const ownerOnly = (request, what) => {
  if (request.storeRole === "staff") throw new HttpError(403, `Only the store owner or an admin can ${what}.`);
};
const TYPES = ["campaign", "adset", "ad"];
const rangeOf = (q) => ({ preset: q.preset, since: q.since, until: q.until });

async function metaAdsRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);
  // Premium-only — enforced here, not just hidden in the admin UI.
  fastify.addHook("preHandler", fastify.requirePlanFeature("marketing_tools"));
  // Checked per request, so uninstalling the app takes effect at once.
  fastify.addHook("preHandler", async (request) => {
    await appsService.assertInstalled(request.server.prisma, request.store.id, "meta-ads");
  });
  const db = fastify.prisma;

  // ── Account and results ──
  fastify.get("/capabilities", async (request) => manager.capabilities(db, request.store));
  fastify.get("/campaigns", async (request) => ({ campaigns: await manager.campaigns(db, request.store, rangeOf(request.query)) }));
  fastify.get("/campaigns/:id/adsets", async (request) => ({ adSets: await manager.adSets(db, request.store, request.params.id, rangeOf(request.query)) }));
  fastify.get("/adsets/:id/ads", async (request) => ({ ads: await manager.ads(db, request.store, request.params.id, rangeOf(request.query)) }));
  fastify.get("/insights", async (request) => insights.overview(db, request.store, rangeOf(request.query), { refresh: request.query.refresh === "1" }));

  // ── Changes to live objects ──
  fastify.patch("/:type/:id", async (request) => {
    ownerOnly(request, "change ads");
    if (!TYPES.includes(request.params.type)) throw new HttpError(404, "Not found");
    const body = z.object({ status: z.enum(["ACTIVE", "PAUSED"]).optional(), name: z.string().min(1).max(400).optional(), budget: z.number().positive().max(1e7).optional(), endTime: z.string().nullable().optional() }).parse(request.body || {});
    return manager.update(db, request.store, request.params.type, request.params.id, body, who(request));
  });
  fastify.post("/:type/:id/duplicate", async (request) => {
    ownerOnly(request, "copy ads");
    if (!TYPES.includes(request.params.type)) throw new HttpError(404, "Not found");
    return manager.duplicate(db, request.store, request.params.type, request.params.id, who(request));
  });
  fastify.delete("/:type/:id", async (request) => {
    ownerOnly(request, "delete ads");
    if (!TYPES.includes(request.params.type)) throw new HttpError(404, "Not found");
    return manager.archive(db, request.store, request.params.type, request.params.id, who(request));
  });

  // ── Building a campaign ──
  fastify.get("/targeting/search", async (request) => ({ results: await manager.searchTargeting(db, request.store, request.query) }));
  fastify.post("/targeting/estimate", async (request) => ({ estimate: await manager.audienceSize(db, request.store, request.body || {}) }));
  fastify.post("/check", async (request) => spec.check(request.body || {}));
  fastify.post("/previews", async (request) => manager.previews(db, request.store, request.body || {}));
  fastify.post("/ai/copy", async (request) => ({ variations: await insights.copyIdeas(db, request.store, request.body || {}) }));

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
  fastify.post("/drafts/:id/copy", async (request) => ({ draft: await publish.cloneDraft(db, request.store, request.params.id, who(request)) }));
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

  // ── Media library ──
  fastify.get("/media", async (request) => ({ media: await manager.library(db, request.store) }));
  fastify.post("/media", async (request, reply) => {
    const file = await request.file({ limits: { fileSize: 200 * 1024 * 1024 } });
    if (!file) throw new HttpError(400, "Choose a file.");
    const buffer = await file.toBuffer();
    reply.code(201).send({ media: await manager.uploadMedia(db, request.store, { buffer, mime: file.mimetype, name: file.filename }) });
  });
  fastify.delete("/media/:id", async (request) => manager.removeMedia(db, request.store, request.params.id));

  // ── Recommendations and automation ──
  fastify.post("/recommendations/apply", async (request) => {
    ownerOnly(request, "change ads");
    const rec = z.object({ type: z.enum(["pause", "budget"]), targetType: z.enum(["adset", "ad", "campaign"]), targetId: z.string().min(1), change: z.object({ from: z.number().optional(), to: z.number().optional(), status: z.string().optional() }) }).parse(request.body || {});
    return insights.applyRecommendation(db, request.store, rec, who(request));
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
    const rule = await db.adRule.findFirst({ where: { id: request.params.id, storeId: request.store.id, platform: "meta" } });
    if (!rule) throw new HttpError(404, "Rule not found");
    return { changes: await rules.run(db, rule, { dryRun: true }) };
  });
  fastify.get("/activity", async (request) => ({
    activity: await db.adActivity.findMany({ where: { storeId: request.store.id, platform: "meta" }, orderBy: { createdAt: "desc" }, take: 200 }),
  }));
}

module.exports = metaAdsRoutes;
