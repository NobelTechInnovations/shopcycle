const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { sendEmail } = require("../../lib/mailer");
const { throttle } = require("../../lib/throttle");
const templates = require("../../emails/templates");
const { storeInboxes } = require("../orders/notify");

/**
 * The store's Contact page: a shopper's message lands in Customers ▸
 * Queries (and the seller's inbox). One-way — the seller answers by email
 * from the admin; the shopper's own reply, if any, goes to the store's
 * email, never back here.
 */

const STATUSES = ["new", "read", "replied", "archived"];
const PAGE_SIZE = 25;

const submitSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80, "The name is too long."),
  email: z.string().trim().toLowerCase().email("Enter a valid email so the store can reply.").max(200),
  phone: z
    .string()
    .trim()
    .max(24)
    .optional()
    .transform((v) => v || null)
    .refine((v) => !v || /^\+?[\d\s()-]{6,24}$/.test(v), "Enter a valid phone number, or leave it empty."),
  message: z.string().trim().min(2, "Write your message.").max(5000, "Keep the message under 5,000 characters."),
  // Hidden field only bots fill in.
  website: z.string().optional(),
});

const adminUrl = (id) => `${env.ADMIN_ORIGIN.replace(/\/$/, "")}/admin/customers/queries?open=${id}`;

function serialize(m) {
  return { ...m, replies: Array.isArray(m.replies) ? m.replies : [] };
}

/** A shopper sends the form. Bots that fill the hidden field get a quiet "sent". */
async function submit(fastify, store, body, { customerId = null, log } = {}) {
  const input = submitSchema.parse(body || {});
  if (input.website) return { ok: true };
  await throttle(fastify, `contact:${store.id}:${input.email}`, { max: 5, windowSeconds: 60 * 60, message: "You've sent a few messages already — the store will get back to you soon." });
  const message = await fastify.prisma.contactMessage.create({
    data: { storeId: store.id, customerId, name: input.name, email: input.email, phone: input.phone, message: input.message },
  });
  // Tell the seller (best effort — the message is saved either way).
  // Replying to this email reaches the shopper directly.
  try {
    const alert = templates.contactMessageAlert({ store, message, adminUrl: adminUrl(message.id) });
    for (const inbox of await storeInboxes(fastify.prisma, store)) {
      await sendEmail(fastify.prisma, { to: inbox, ...alert, template: "contact_message_alert", storeId: store.id, replyTo: message.email, refType: "contact", refId: message.id, log });
    }
  } catch (err) {
    log?.warn({ err }, "contact: seller alert failed");
  }
  return { ok: true };
}

async function list(prisma, storeId, { status = "inbox", q, page = 1 } = {}) {
  const where = { storeId };
  if (status === "inbox") where.status = { not: "archived" };
  else if (STATUSES.includes(status)) where.status = status;
  const term = String(q || "").trim();
  if (term) {
    where.OR = ["name", "email", "phone", "message"].map((field) => ({ [field]: { contains: term, mode: "insensitive" } }));
  }
  const [rows, total, counts] = await Promise.all([
    prisma.contactMessage.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.groupBy({ by: ["status"], where: { storeId }, _count: { _all: true } }),
  ]);
  const by = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  return {
    messages: rows.map(serialize),
    total,
    page,
    pageSize: PAGE_SIZE,
    counts: { new: by.new || 0, inbox: (by.new || 0) + (by.read || 0) + (by.replied || 0), replied: by.replied || 0, archived: by.archived || 0 },
  };
}

async function find(prisma, storeId, id) {
  const row = await prisma.contactMessage.findFirst({ where: { id, storeId } });
  if (!row) throw new HttpError(404, "Message not found");
  return row;
}

async function setStatus(prisma, storeId, id, status) {
  if (!STATUSES.includes(status)) throw new HttpError(400, "Unknown status");
  await find(prisma, storeId, id);
  return serialize(await prisma.contactMessage.update({ where: { id }, data: { status } }));
}

/** The seller's answer, emailed to the shopper from the store. */
async function reply(prisma, store, id, body, { by, log } = {}) {
  const text = z.string().trim().min(1, "Write your reply.").max(5000).parse(body);
  const message = await find(prisma, store.id, id);
  const inboxes = await storeInboxes(prisma, store);
  const mail = templates.contactReply({ store, message, reply: text });
  const sent = await sendEmail(prisma, {
    to: message.email,
    ...mail,
    template: "contact_reply",
    storeId: store.id,
    fromName: store.name,
    replyTo: store.supportEmail || inboxes[0] || undefined,
    refType: "contact",
    refId: message.id,
    log,
  });
  if (sent.status === "failed") throw new HttpError(502, "The email couldn't be sent. Try again in a minute.");
  const replies = [...(Array.isArray(message.replies) ? message.replies : []), { body: text, at: new Date().toISOString(), by: by || null }];
  return serialize(await prisma.contactMessage.update({ where: { id }, data: { replies, status: "replied" } }));
}

async function remove(prisma, storeId, id) {
  await find(prisma, storeId, id);
  await prisma.contactMessage.delete({ where: { id } });
}

const unread = (prisma, storeId) => prisma.contactMessage.count({ where: { storeId, status: "new" } });

module.exports = { submit, list, setStatus, reply, remove, unread };
