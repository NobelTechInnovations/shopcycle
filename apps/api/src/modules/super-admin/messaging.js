const crypto = require("crypto");
const { z } = require("zod");
const templates = require("../../lib/whatsapp-templates");
const messaging = require("../../lib/messaging");
const { toE164 } = require("../../lib/phone");

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
