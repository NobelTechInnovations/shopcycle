const crypto = require("crypto");
const { z } = require("zod");
const templates = require("../../lib/whatsapp-templates");
const messaging = require("../../lib/messaging");
const { toE164 } = require("../../lib/phone");
const { HttpError } = require("@shopcycle/utils");
const platform = require("../whatsapp/platform");
const cloud = require("../whatsapp/cloud");
const waService = require("../whatsapp/service");
const standard = require("../whatsapp/standard-templates");

/**
 * /api/super-admin/messaging — the platform's WhatsApp templates, shared by
 * every store (only the verification code today). Inherits the super-admin
 * auth hooks and the audit log from routes.js.
 */
const template = z.object({
  templateKey: z.string().trim().max(200).default(""),
  enabled: z.boolean().default(true),
  vars: z.record(z.string(), z.string().trim().min(1).max(60)).default({}),
});
const saveSchema = z.object({ otp: template });
const testSchema = z.object({ to: z.string().trim().min(6).max(24), channel: z.enum(["whatsapp", "sms"]).optional() });

const masked = (to) => (to && to.length > 4 ? `+${to.slice(0, -4).replace(/\d/g, "•")}${to.slice(-4)}` : to);

async function recent(prisma) {
  const rows = await prisma.messageLog.findMany({
    where: { channel: { in: ["whatsapp", "sms"] } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, to: true, template: true, provider: true, status: true, error: true, createdAt: true, channel: true, storeId: true },
  });
  return rows.map((r) => ({ ...r, to: masked(r.to) }));
}

async function messagingRoutes(fastify) {
  const { prisma } = fastify;

  fastify.get("/", async () => ({
    types: templates.TYPES,
    templates: await templates.load(prisma),
    zoho: templates.accountSummary(),
    status: messaging.whatsappStatus(),
    recent: await recent(prisma),
  }));

  // ── Oyklane's own WhatsApp number (the default sender for every store) ──
  fastify.get("/platform", async () => platform.status(prisma));
  fastify.post("/platform/token", async (request) => {
    const { token } = z.object({ token: z.string().min(20).max(2000) }).parse(request.body || {});
    return platform.useToken(prisma, token, request.currentUser.id);
  });
  // The token is saved but no number picked yet: what it can use.
  fastify.get("/platform/wabas", async () => ({ wabas: await platform.wabas(prisma) }));
  fastify.get("/platform/wabas/:id", async (request) => ({ wabas: await platform.lookupWaba(prisma, request.params.id) }));
  fastify.post("/platform/number", async (request) => {
    const body = z.object({ wabaId: z.string().min(1), phoneNumberId: z.string().min(1) }).parse(request.body || {});
    await platform.choose(prisma, body, request.currentUser.id);
    return platform.status(prisma);
  });
  fastify.post("/platform/activate", async (request) => {
    const { pin } = z.object({ pin: z.string().regex(/^\d{6}$/).optional() }).parse(request.body || {});
    await platform.activate(prisma, pin, request.currentUser.id);
    return platform.status(prisma);
  });
  fastify.delete("/platform", async (request) => {
    await platform.save(prisma, { token: null, wabaId: null, wabaName: null, phoneNumberId: null, phoneNumberLabel: null, activatedAt: null, subscribedAt: null }, request.currentUser.id);
    return platform.status(prisma);
  });
  fastify.get("/platform/templates", async () => {
    const conn = await platform.connection(prisma);
    if (!conn) return { templates: [], standard: standard.KINDS };
    return { templates: (await cloud.listTemplates(conn, { fresh: true })).map(waService.shapeTemplate), standard: standard.KINDS, otp: standard.OTP_TEMPLATE };
  });
  // Oyklane's own templates — only Super admin creates, edits or deletes
  // them; stores on the shared number see them read-only.
  const platformConn = async () => {
    const conn = await platform.connection(prisma);
    if (!conn?.wabaId) throw new HttpError(400, "Choose Oyklane's WhatsApp number first.");
    return conn;
  };
  fastify.post("/platform/templates/validate", async (request) => ({ ok: true, spec: waService.buildTemplate(request.body || {}) }));
  fastify.post("/platform/templates", async (request, reply) => {
    const spec = waService.buildTemplate(request.body || {});
    const out = await cloud.createTemplate(await platformConn(), spec);
    reply.code(201).send({ id: out.id, status: out.status, category: out.category });
  });
  fastify.post("/platform/templates/sample", async (request) => {
    const file = await request.file({ limits: { fileSize: 16 * 1024 * 1024 } });
    if (!file) throw new HttpError(400, "Choose a file.");
    const buffer = await file.toBuffer();
    if (buffer.length > 16 * 1024 * 1024) throw new HttpError(400, "The sample must be under 16 MB.");
    return { handle: await cloud.uploadTemplateSample(await platformConn(), { buffer, mime: file.mimetype, name: file.filename }) };
  });
  fastify.post("/platform/templates/:id", async (request) => {
    const spec = waService.buildTemplate(request.body || {});
    await cloud.editTemplate(await platformConn(), request.params.id, { components: spec.components, ...(request.body?.categoryChange ? { category: spec.category } : {}) });
    return { ok: true };
  });
  fastify.delete("/platform/templates/:name", async (request) => {
    await cloud.deleteTemplate(await platformConn(), { name: request.params.name, id: request.query.id });
    return { ok: true };
  });
  fastify.post("/platform/templates/install", async () => {
    const conn = await platform.connection(prisma);
    if (!conn?.wabaId) return { error: "Connect Oyklane's number first." };
    return { results: await platform.installStandard(conn, { withOtp: true }) };
  });
  fastify.put("/platform/notifications", async (request) => {
    const body = z.object({ enabled: z.boolean(), events: z.object({ orderConfirmed: z.boolean(), shipped: z.boolean(), delivered: z.boolean() }) }).parse(request.body || {});
    await platform.save(prisma, { notifications: body }, request.currentUser.id);
    return platform.status(prisma);
  });
  // A real order-confirmation message (sample values) to a number you choose.
  fastify.post("/platform/test", async (request, reply) => {
    const { to } = testSchema.parse(request.body || {});
    const phone = toE164(to);
    if (!phone) return reply.code(400).send({ error: "Enter the number with its country code, e.g. +91 98765 43210." });
    const conn = await platform.connection(prisma);
    if (!conn) return reply.code(400).send({ error: "Connect Oyklane's number first." });
    const all = (await cloud.listTemplates(conn, { fresh: true })).map(waService.shapeTemplate);
    const tpl = all.find((t) => t.name === standard.KINDS.orderConfirmed.name && t.status === "APPROVED") || all.find((t) => t.name === "hello_world" && t.status === "APPROVED");
    if (!tpl) return reply.code(400).send({ error: "No approved template to test with yet — install the standard templates and wait for Meta's approval." });
    const body = tpl.bodyVariables ? standard.KINDS.orderConfirmed.examples : [];
    const sent = await cloud.send(conn, { to: phone, type: "template", template: { name: tpl.name, language: { code: tpl.language }, components: waService.templateComponents(tpl, { body, buttonUrl: "test" }) } });
    return { ok: true, id: sent.id, template: tpl.name, to: masked(phone) };
  });

  // The Zoho CPaaS account WhatsApp codes go through (shared by every store).
  fastify.put("/zoho", async (request) => {
    const body = z
      .object({ token: z.string().max(500).optional(), from: z.string().max(30).optional(), region: z.enum(["in", "com", "eu"]).optional(), enabled: z.boolean().optional(), clearKey: z.boolean().optional() })
      .parse(request.body || {});
    const zoho = await templates.saveAccount(prisma, body, request.currentUser.id);
    return { zoho, status: messaging.whatsappStatus() };
  });

  fastify.put("/templates", async (request) => {
    const body = saveSchema.parse(request.body || {});
    const saved = await templates.save(prisma, body, request.currentUser.id);
    return { templates: saved, status: messaging.whatsappStatus() };
  });

  // Sends a real code to the number given — the only way to know the
  // template, the sending number and the account all line up.
  fastify.post("/test", async (request, reply) => {
    const { to, channel } = testSchema.parse(request.body || {});
    const phone = toE164(to);
    if (!phone) return reply.code(400).send({ error: "Enter the number with its country code, e.g. +91 98765 43210." });
    // A test SMS code (APITXT) — not billed to any store.
    if (channel === "sms") {
      if (messaging.smsProvider() === "log") return reply.code(400).send({ error: "No SMS provider on the server — set APITXT_AUTH_KEY on Railway." });
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
      const result = await messaging.sendOtp(prisma, { to: phone, code, channel: "sms", log: request.log });
      return { ...result, to: masked(phone), recent: await recent(prisma) };
    }
    await templates.load(prisma);
    if (messaging.whatsappProvider() === "log") {
      return reply.code(400).send({ error: "WhatsApp isn't set up yet — add the template key above and make sure the Zoho account and sending number are on the server." });
    }
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const result = await messaging.sendOtp(prisma, { to: phone, code, channel: "whatsapp", log: request.log, fallback: false });
    return { ...result, to: masked(phone), recent: await recent(prisma) };
  });
}

module.exports = messagingRoutes;
