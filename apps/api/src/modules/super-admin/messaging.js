const crypto = require("crypto");
const { z } = require("zod");
const templates = require("../../lib/whatsapp-templates");
const messaging = require("../../lib/messaging");
const { toE164 } = require("../../lib/phone");
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
const testSchema = z.object({ to: z.string().trim().min(6).max(24) });

const masked = (to) => (to && to.length > 4 ? `+${to.slice(0, -4).replace(/\d/g, "•")}${to.slice(-4)}` : to);

async function recent(prisma) {
  const rows = await prisma.messageLog.findMany({
    where: { channel: "whatsapp" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, to: true, template: true, provider: true, status: true, error: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, to: masked(r.to) }));
}

async function messagingRoutes(fastify) {
  const { prisma } = fastify;

  fastify.get("/", async () => ({
    types: templates.TYPES,
    templates: await templates.load(prisma),
    status: messaging.whatsappStatus(),
    recent: await recent(prisma),
  }));

  // ── Oyklane's own WhatsApp number (the default sender for every store) ──
  fastify.get("/platform", async () => platform.status(prisma));
  fastify.post("/platform/token", async (request) => {
    const { token } = z.object({ token: z.string().min(20).max(2000) }).parse(request.body || {});
    return platform.useToken(prisma, token, request.currentUser.id);
  });
  fastify.post("/platform/number", async (request) => {
    const body = z.object({ wabaId: z.string().min(1), phoneNumberId: z.string().min(1) }).parse(request.body || {});
    await platform.choose(prisma, body, request.currentUser.id);
    return platform.status(prisma);
  });
  fastify.post("/platform/activate", async (request) => {
    const { pin } = z.object({ pin: z.string().regex(/^\d{6}$/) }).parse(request.body || {});
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

  fastify.put("/templates", async (request) => {
    const body = saveSchema.parse(request.body || {});
    const saved = await templates.save(prisma, body, request.currentUser.id);
    return { templates: saved, status: messaging.whatsappStatus() };
  });

  // Sends a real code to the number given — the only way to know the
  // template, the sending number and the account all line up.
  fastify.post("/test", async (request, reply) => {
    const { to } = testSchema.parse(request.body || {});
    const phone = toE164(to);
    if (!phone) return reply.code(400).send({ error: "Enter the number with its country code, e.g. +91 98765 43210." });
    await templates.load(prisma);
    if (messaging.whatsappProvider() === "log") {
      return reply.code(400).send({ error: "WhatsApp isn't set up yet — add the template key above and make sure the Zoho account and sending number are on the server." });
    }
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const result = await messaging.sendOtp(prisma, { to: phone, code, channel: "whatsapp", log: request.log });
    return { ...result, to: masked(phone), recent: await recent(prisma) };
  });
}

module.exports = messagingRoutes;
