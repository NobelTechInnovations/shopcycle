const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const appsService = require("../apps/service");
const { recordAudit } = require("../../lib/audit");
const service = require("./service");
const cloud = require("./cloud");
const broadcasts = require("./broadcasts");
const events = require("./events");

const ownerOnly = (request, what) => {
  if (request.storeRole === "staff") throw new HttpError(403, `Only the store owner or an admin can ${what}.`);
};
const who = (request) => request.currentUser || request.authUser || null;

async function whatsappRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);
  // Premium-only — enforced here, not just hidden in the admin UI.
  fastify.addHook("preHandler", fastify.requirePlanFeature("marketing_tools"));
  fastify.addHook("preHandler", async (request) => {
    await appsService.assertInstalled(request.server.prisma, request.store.id, "whatsapp");
  });
  const db = fastify.prisma;
  const audit = (request, action, metadata) => recordAudit(request, { scope: "store", actor: who(request), action, storeId: request.store.id, metadata });

  // ── Connection ──
  fastify.get("/health", async (request) => cloud.health(db, request.store));
  fastify.get("/signup-config", async () => cloud.signupConfig());
  fastify.post("/activate", async (request) => {
    ownerOnly(request, "activate the WhatsApp number");
    const { pin } = z.object({ pin: z.string().regex(/^\d{6}$/, "Enter the 6-digit PIN.") }).parse(request.body || {});
    const out = await cloud.activate(db, request.store, { pin });
    audit(request, "whatsapp.number_activated", { phoneNumberId: out.phoneNumberId });
    return out;
  });
  fastify.post("/embedded-signup", async (request) => {
    ownerOnly(request, "connect WhatsApp");
    const body = z.object({ code: z.string().min(1), wabaId: z.string().min(1), phoneNumberId: z.string().optional(), businessId: z.string().optional() }).parse(request.body || {});
    const out = await cloud.completeSignup(db, request.store, body);
    audit(request, "whatsapp.embedded_signup", { wabaId: body.wabaId, phoneNumberId: out.number?.id || null });
    return out;
  });

  // ── Inbox ──
  fastify.get("/conversations", async (request) => service.listConversations(db, request.store.id, { ...request.query, userId: who(request)?.id, page: Number(request.query.page) || 1 }));
  fastify.post("/conversations", async (request, reply) => {
    const body = z.object({ phone: z.string().optional(), customerId: z.string().optional(), templateName: z.string(), language: z.string(), body: z.array(z.string()).optional(), header: z.array(z.string()).optional(), headerMediaUrl: z.string().url().optional(), buttonUrl: z.string().optional(), confirmConsent: z.boolean().optional() }).parse(request.body || {});
    reply.code(201).send(await service.startConversation(db, request.store, body, who(request)));
  });
  fastify.get("/conversations/:id", async (request) => service.getConversation(db, request.store, request.params.id, { before: request.query.before }));
  fastify.patch("/conversations/:id", async (request) => {
    const body = z.object({ status: z.enum(["open", "closed"]).optional(), assignedToId: z.string().nullable().optional(), labels: z.array(z.string()).optional(), handledBy: z.enum(["ai", "human"]).optional(), customerId: z.string().nullable().optional() }).parse(request.body || {});
    let member = null;
    if (body.assignedToId) {
      const m = await db.storeUser.findFirst({ where: { storeId: request.store.id, userId: body.assignedToId }, include: { user: { select: { name: true, email: true } } } });
      member = m?.user;
      if (!member) throw new HttpError(400, "That person isn't on this store's team.");
    }
    return { conversation: await service.updateConversation(db, request.store, request.params.id, body, member) };
  });
  fastify.post("/conversations/:id/read", async (request) => service.markRead(db, request.store, request.params.id));
  fastify.post("/conversations/:id/messages", async (request, reply) => {
    const body = z
      .object({
        kind: z.enum(["text", "media", "template"]),
        body: z.union([z.string(), z.array(z.string())]).optional(),
        mediaId: z.string().optional(),
        mediaType: z.enum(["image", "video", "document", "audio"]).optional(),
        caption: z.string().max(1024).optional(),
        filename: z.string().max(200).optional(),
        templateName: z.string().optional(),
        language: z.string().optional(),
        header: z.array(z.string()).optional(),
        headerMediaUrl: z.string().url().optional(),
        buttonUrl: z.string().optional(),
        confirmConsent: z.boolean().optional(),
      })
      .parse(request.body || {});
    const input = body.kind === "template" ? { ...body, body: Array.isArray(body.body) ? body.body : [] } : { ...body, body: Array.isArray(body.body) ? body.body.join(" ") : body.body };
    const out = await service.sendFromInbox(db, request.store, request.params.id, input, who(request));
    reply.code(201).send(out);
  });
  fastify.post("/conversations/:id/media", async (request) => {
    const file = await request.file();
    if (!file) throw new HttpError(400, "Choose a file.");
    const buffer = await file.toBuffer();
    const mime = file.mimetype || "application/octet-stream";
    const limits = { image: 5, video: 16, audio: 16, document: 100 };
    const type = /^image\/(jpeg|png)$/.test(mime) ? "image" : /^video\/(mp4|3gpp)$/.test(mime) ? "video" : /^audio\//.test(mime) ? "audio" : "document";
    if (buffer.length > limits[type] * 1024 * 1024) throw new HttpError(400, `WhatsApp allows ${type}s up to ${limits[type]} MB.`);
    const conn = await cloud.connectionOrThrow(db, request.store.id);
    const id = await cloud.uploadMedia(conn, { buffer, mime, name: file.filename });
    return { mediaId: id, mediaType: type, filename: file.filename };
  });
  fastify.get("/messages/:id/media", async (request, reply) => {
    const msg = await db.whatsappMessage.findFirst({ where: { id: request.params.id, storeId: request.store.id } });
    if (!msg?.mediaId) throw new HttpError(404, "No file on this message.");
    const conn = await cloud.connectionOrThrow(db, request.store.id);
    const { buffer, mime } = await cloud.downloadMedia(conn, msg.mediaId);
    reply.header("content-type", mime).header("cache-control", "private, max-age=3600").header("x-content-type-options", "nosniff");
    if (!/^(image|video|audio)\//.test(mime)) reply.header("content-disposition", "attachment");
    return reply.send(buffer);
  });
  fastify.post("/conversations/:id/notes", async (request, reply) => {
    const { body } = z.object({ body: z.string().min(1).max(4000) }).parse(request.body || {});
    reply.code(201).send({ note: await service.addNote(db, request.store, request.params.id, body, who(request)) });
  });
  fastify.post("/conversations/:id/suggest", async (request) => service.suggestReply(db, request.store, request.params.id));

  // ── Templates ──
  fastify.get("/templates", async (request) => {
    const all = await service.templates(db, request.store);
    return { templates: request.query.status === "approved" ? all.filter((t) => t.status === "APPROVED") : all };
  });
  fastify.post("/templates/validate", async (request) => ({ ok: true, spec: service.buildTemplate(request.body || {}) }));
  fastify.post("/templates", async (request, reply) => {
    ownerOnly(request, "create WhatsApp templates");
    const spec = service.buildTemplate(request.body || {});
    const conn = await cloud.connectionOrThrow(db, request.store.id, { needNumber: false });
    const out = await cloud.createTemplate(conn, spec);
    audit(request, "whatsapp.template_submitted", { name: spec.name, language: spec.language, status: out.status });
    reply.code(201).send({ id: out.id, status: out.status, category: out.category });
  });
  fastify.post("/templates/:id", async (request) => {
    ownerOnly(request, "edit WhatsApp templates");
    const spec = service.buildTemplate(request.body || {});
    const conn = await cloud.connectionOrThrow(db, request.store.id, { needNumber: false });
    await cloud.editTemplate(conn, request.params.id, { components: spec.components, ...(request.body?.categoryChange ? { category: spec.category } : {}) });
    audit(request, "whatsapp.template_edited", { name: spec.name });
    return { ok: true };
  });
  fastify.delete("/templates/:name", async (request) => {
    ownerOnly(request, "delete WhatsApp templates");
    const conn = await cloud.connectionOrThrow(db, request.store.id, { needNumber: false });
    await cloud.deleteTemplate(conn, { name: request.params.name, id: request.query.id });
    audit(request, "whatsapp.template_deleted", { name: request.params.name });
    return { ok: true };
  });
  fastify.post("/templates/sample", async (request) => {
    ownerOnly(request, "create WhatsApp templates");
    const file = await request.file();
    if (!file) throw new HttpError(400, "Choose a file.");
    const buffer = await file.toBuffer();
    if (buffer.length > 16 * 1024 * 1024) throw new HttpError(400, "The sample must be under 16 MB.");
    const conn = await cloud.connectionOrThrow(db, request.store.id, { needNumber: false });
    return { handle: await cloud.uploadTemplateSample(conn, { buffer, mime: file.mimetype, name: file.filename }) };
  });

  // ── Broadcasts ──
  fastify.get("/broadcasts", async (request) => ({ broadcasts: await broadcasts.list(db, request.store.id), segments: broadcasts.SEGMENTS, variableSources: broadcasts.VARIABLE_SOURCES }));
  fastify.post("/broadcasts/preview", async (request) => broadcasts.preview(db, request.store, request.body || {}));
  fastify.post("/broadcasts", async (request, reply) => {
    ownerOnly(request, "send WhatsApp broadcasts");
    reply.code(201).send({ broadcast: await broadcasts.save(db, request.store, request.body || {}, who(request)) });
  });
  fastify.get("/broadcasts/:id", async (request) => broadcasts.get(db, request.store, request.params.id));
  fastify.patch("/broadcasts/:id", async (request) => {
    ownerOnly(request, "send WhatsApp broadcasts");
    return { broadcast: await broadcasts.save(db, request.store, request.body || {}, who(request), request.params.id) };
  });
  fastify.post("/broadcasts/test", async (request) => {
    ownerOnly(request, "send WhatsApp broadcasts");
    const { phone } = z.object({ phone: z.string().min(6) }).parse(request.body || {});
    return broadcasts.testSend(db, request.store, request.body || {}, phone);
  });
  fastify.post("/broadcasts/:id/schedule", async (request) => {
    ownerOnly(request, "send WhatsApp broadcasts");
    const body = z.object({ scheduledAt: z.string().optional().nullable(), confirm: z.literal(true) }).parse(request.body || {});
    const bc = await broadcasts.schedule(db, request.store, request.params.id, body);
    audit(request, "whatsapp.broadcast_scheduled", { id: bc.id, name: bc.name, scheduledAt: bc.scheduledAt });
    return { broadcast: bc };
  });
  fastify.post("/broadcasts/:id/cancel", async (request) => {
    ownerOnly(request, "send WhatsApp broadcasts");
    return { broadcast: await broadcasts.cancel(db, request.store, request.params.id) };
  });

  // ── Inbox settings: auto-assign and the AI assistant ──
  fastify.get("/settings", async (request) => {
    const team = await db.storeUser.findMany({ where: { storeId: request.store.id }, include: { user: { select: { id: true, name: true, email: true } } } });
    return { settings: events.inboxSettings(request.store), team: team.map((m) => ({ id: m.userId, name: m.user.name || m.user.email, role: m.role })), aiAvailable: require("../../lib/ai").aiConfigured() };
  });
  fastify.put("/settings", async (request) => {
    ownerOnly(request, "change WhatsApp inbox settings");
    const body = z.object({ autoAssign: z.string().max(60), ai: z.object({ enabled: z.boolean(), instructions: z.string().max(2000).optional() }) }).parse(request.body || {});
    const current = await db.store.findUnique({ where: { id: request.store.id }, select: { settings: true } });
    const settings = { ...(current.settings || {}), whatsapp: { autoAssign: body.autoAssign, ai: { enabled: body.ai.enabled, instructions: body.ai.instructions || "" } } };
    await db.store.update({ where: { id: request.store.id }, data: { settings } });
    audit(request, "whatsapp.settings_changed", { autoAssign: body.autoAssign, ai: body.ai.enabled });
    return { settings: settings.whatsapp };
  });

  // ── Consent & opt-outs ──
  fastify.get("/opt-outs", async (request) => ({ optOuts: await service.listOptOuts(db, request.store.id) }));
  fastify.post("/opt-outs", async (request, reply) => {
    const { phone, reason } = z.object({ phone: z.string().min(6), reason: z.string().max(200).optional() }).parse(request.body || {});
    reply.code(201).send({ optOut: await service.addOptOut(db, request.store.id, phone, reason) });
  });
  fastify.delete("/opt-outs/:id", async (request) => {
    ownerOnly(request, "remove numbers from the opt-out list");
    await service.removeOptOut(db, request.store.id, request.params.id);
    return { ok: true };
  });
  fastify.post("/customers/:id/consent", async (request) => {
    const { accepts, source } = z.object({ accepts: z.boolean(), source: z.string().max(60).optional() }).parse(request.body || {});
    const c = await service.setConsent(db, request.store.id, request.params.id, accepts, source || "admin");
    return { customer: { id: c.id, acceptsWhatsappMarketing: c.acceptsWhatsappMarketing, whatsappConsentAt: c.whatsappConsentAt } };
  });

  // ── Older single-send screen ──
  fastify.get("/messages", async (request) => ({ messages: await service.listMessages(db, request.store.id, { customerId: request.query.customerId, page: Number(request.query.page) || 1 }) }));
}

module.exports = whatsappRoutes;
