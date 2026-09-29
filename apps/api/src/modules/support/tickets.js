const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { sendEmail } = require("../../lib/mailer");
const templates = require("../../emails/templates");
const { getSupportSettings, inboxFor } = require("./settings");

/**
 * Seller tickets. A seller opens one when the assistant couldn't help (the
 * conversation comes along); the Oyklane team answers in Super admin ▸
 * Support, and every reply is emailed to the seller and shown in their
 * Help page. Replies from the seller are emailed to the support inbox.
 *
 *   open     — waiting on Oyklane
 *   waiting  — answered, waiting on the seller
 *   resolved — done (the seller or the team said so); a new reply reopens it
 *   closed   — done for good
 */

const STATUSES = ["open", "waiting", "resolved", "closed"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const ticketNo = (t) => `#${1000 + t.number}`;
const adminBase = () => env.ADMIN_ORIGIN.replace(/\/$/, "");
const superBase = () => String(env.SUPER_ADMIN_ORIGIN || "").replace(/\/$/, "");
const str = (v, max) => String(v ?? "").trim().slice(0, max);

function shape(t, { withMessages = false } = {}) {
  return {
    id: t.id,
    number: t.number,
    ref: ticketNo(t),
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    email: t.email,
    name: t.name,
    chatId: t.chatId,
    lastMessageAt: t.lastMessageAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    ...(t.store && { store: { id: t.store.id, name: t.store.name, handle: t.store.handle } }),
    ...(withMessages && { messages: (t.messages || []).map((m) => ({ id: m.id, author: m.author, authorName: m.authorName, body: m.body, createdAt: m.createdAt })) }),
    ...(t._count && { messageCount: t._count.messages }),
  };
}

function transcriptText(chat) {
  return (Array.isArray(chat?.messages) ? chat.messages : [])
    .map((m) => `${m.role === "user" ? "Seller" : "Assistant"}: ${m.content}`)
    .join("\n\n")
    .slice(0, 12000);
}

async function notifyInbox(prisma, ticket, { title, intro, message, author, log }) {
  const inbox = await inboxFor(prisma, await getSupportSettings(prisma));
  if (!inbox) return;
  const email = templates.supportTicketEmail({
    title,
    intro,
    message,
    author,
    cta: "Open in Super admin",
    ctaUrl: superBase() ? `${superBase()}/support/${ticket.id}` : null,
    footer: `Ticket ${ticketNo(ticket)} · ${ticket.email}`,
  });
  await sendEmail(prisma, { to: inbox, ...email, template: "support_ticket_inbox", replyTo: ticket.email, refType: "support_ticket", refId: ticket.id, log });
}

async function create(prisma, store, user, input, { log } = {}) {
  const settings = await getSupportSettings(prisma);
  const subject = str(input.subject, 160);
  const body = str(input.body, 8000);
  if (subject.length < 3) throw new HttpError(400, "Add a short subject.");
  if (body.length < 5) throw new HttpError(400, "Tell us a little more about the problem.");
  const category = settings.categories.some((c) => c.key === input.category) ? input.category : settings.categories[0]?.key || "general";
  const priority = PRIORITIES.includes(input.priority) ? input.priority : "normal";
  const open = await prisma.supportTicket.count({ where: { storeId: store.id, status: { in: ["open", "waiting"] } } });
  if (open >= 20) throw new HttpError(429, "Your store has 20 open tickets — reply on one of those, or close the ones that are sorted.");

  let chat = null;
  if (input.chatId) {
    chat = await prisma.supportChat.findFirst({ where: { id: String(input.chatId), storeId: store.id, userId: user.id } });
  }
  const ticket = await prisma.supportTicket.create({
    data: {
      storeId: store.id,
      userId: user.id,
      email: user.email,
      name: user.name || user.email,
      subject,
      category,
      priority,
      chatId: chat?.id || null,
      messages: { create: [{ author: "seller", authorName: user.name || user.email, authorId: user.id, body }] },
    },
  });
  if (chat) await prisma.supportChat.update({ where: { id: chat.id }, data: { resolved: false, ticketId: ticket.id } });

  const seller = templates.supportTicketEmail({
    title: `We've got your request ${ticketNo(ticket)}`,
    intro: `Thanks, ${String(user.name || "").split(" ")[0] || "there"} — the Oyklane team will reply ${settings.replyPromise}. You'll get the answer here by email and in your dashboard's Help page.`,
    message: body,
    author: `${subject} · ${store.name}`,
    cta: "View your ticket",
    ctaUrl: `${adminBase()}/admin/support/tickets/${ticket.id}`,
  });
  await sendEmail(prisma, { to: user.email, ...seller, template: "support_ticket_opened", storeId: store.id, refType: "support_ticket", refId: ticket.id, log });

  const transcript = chat ? transcriptText(chat) : "";
  await notifyInbox(prisma, ticket, {
    title: `New ticket ${ticketNo(ticket)} — ${subject}`,
    intro: `${user.name || user.email} (${store.name}, ${store.handle}) · ${settings.categories.find((c) => c.key === category)?.label || category} · ${priority} priority`,
    message: transcript ? `${body}\n\n— Their conversation with the assistant —\n\n${transcript}` : body,
    author: user.email,
    log,
  });
  return shape(ticket);
}

async function listForStore(prisma, store, { status } = {}) {
  const where = { storeId: store.id, ...(status === "open" ? { status: { in: ["open", "waiting"] } } : status === "closed" ? { status: { in: ["resolved", "closed"] } } : {}) };
  const rows = await prisma.supportTicket.findMany({ where, orderBy: { lastMessageAt: "desc" }, take: 100, include: { _count: { select: { messages: true } } } });
  return rows.map((t) => shape(t));
}

async function getForStore(prisma, store, id) {
  const t = await prisma.supportTicket.findFirst({ where: { id, storeId: store.id }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!t) throw new HttpError(404, "Ticket not found");
  return shape(t, { withMessages: true });
}

/** The seller writes back — the ticket goes back to the team. */
async function sellerReply(prisma, store, user, id, text, { log } = {}) {
  const body = str(text, 8000);
  if (!body) throw new HttpError(400, "Write your reply first.");
  const t = await prisma.supportTicket.findFirst({ where: { id, storeId: store.id } });
  if (!t) throw new HttpError(404, "Ticket not found");
  if (t.status === "closed") throw new HttpError(400, "This ticket is closed — open a new one from Help.");
  await prisma.$transaction([
    prisma.supportMessage.create({ data: { ticketId: t.id, author: "seller", authorName: user.name || user.email, authorId: user.id, body } }),
    prisma.supportTicket.update({ where: { id: t.id }, data: { status: "open", lastMessageAt: new Date() } }),
  ]);
  await notifyInbox(prisma, t, { title: `Reply on ${ticketNo(t)} — ${t.subject}`, intro: `${user.name || user.email} (${store.name}) replied.`, message: body, author: user.email, log });
  return getForStore(prisma, store, id);
}

async function sellerResolve(prisma, store, id) {
  const t = await prisma.supportTicket.findFirst({ where: { id, storeId: store.id } });
  if (!t) throw new HttpError(404, "Ticket not found");
  if (t.status !== "closed") {
    await prisma.$transaction([
      prisma.supportTicket.update({ where: { id: t.id }, data: { status: "resolved" } }),
      prisma.supportMessage.create({ data: { ticketId: t.id, author: "system", authorName: "Oyklane", body: "Marked as solved by the seller." } }),
    ]);
  }
  return getForStore(prisma, store, id);
}

// ── Super admin ─────────────────────────────────────────────────────

async function listAll(prisma, { status, q, page = 1, pageSize = 25 } = {}) {
  const where = {
    ...(status && status !== "all" ? { status: status === "active" ? { in: ["open", "waiting"] } : status } : {}),
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { store: { name: { contains: q, mode: "insensitive" } } },
            ...(/^#?\d+$/.test(q) ? [{ number: Number(q.replace("#", "")) - 1000 }] : []),
          ],
        }
      : {}),
  };
  const [rows, total, counts] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { store: { select: { id: true, name: true, handle: true } }, _count: { select: { messages: true } } },
    }),
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return { tickets: rows.map((t) => shape(t)), total, page, pageSize, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) };
}

async function getAny(prisma, id) {
  const t = await prisma.supportTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } }, store: { select: { id: true, name: true, handle: true, domain: true } } },
  });
  if (!t) throw new HttpError(404, "Ticket not found");
  const chat = t.chatId ? await prisma.supportChat.findUnique({ where: { id: t.chatId } }) : null;
  return { ...shape(t, { withMessages: true }), transcript: Array.isArray(chat?.messages) ? chat.messages : [] };
}

/** The team answers: saved on the ticket and emailed to the seller. */
async function teamReply(prisma, actor, id, { body: text, status }, { log } = {}) {
  const body = str(text, 10000);
  if (!body) throw new HttpError(400, "Write the reply first.");
  const t = await prisma.supportTicket.findUnique({ where: { id }, include: { store: true } });
  if (!t) throw new HttpError(404, "Ticket not found");
  const next = STATUSES.includes(status) ? status : "waiting";
  const authorName = actor?.name ? `${actor.name.split(" ")[0]} · Oyklane Support` : "Oyklane Support";
  await prisma.$transaction([
    prisma.supportMessage.create({ data: { ticketId: t.id, author: "support", authorName, authorId: actor?.id || null, body } }),
    prisma.supportTicket.update({ where: { id: t.id }, data: { status: next, lastMessageAt: new Date() } }),
  ]);
  const email = templates.supportTicketEmail({
    title: `Re: ${t.subject} [${ticketNo(t)}]`,
    intro: next === "resolved" ? "We've answered your request and marked it solved. Reply if you need anything else." : "The Oyklane team replied to your request:",
    message: body,
    author: authorName,
    cta: "Reply in your dashboard",
    ctaUrl: `${adminBase()}/admin/support/tickets/${t.id}`,
  });
  const settings = await getSupportSettings(prisma);
  const inbox = await inboxFor(prisma, settings);
  await sendEmail(prisma, { to: t.email, ...email, template: "support_ticket_reply", storeId: t.storeId, replyTo: inbox || undefined, refType: "support_ticket", refId: t.id, log });
  return getAny(prisma, id);
}

async function update(prisma, id, input) {
  const t = await prisma.supportTicket.findUnique({ where: { id } });
  if (!t) throw new HttpError(404, "Ticket not found");
  const data = {};
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status)) throw new HttpError(400, "Unknown status");
    data.status = input.status;
  }
  if (input.priority !== undefined) {
    if (!PRIORITIES.includes(input.priority)) throw new HttpError(400, "Unknown priority");
    data.priority = input.priority;
  }
  if (input.category !== undefined) data.category = str(input.category, 40) || t.category;
  await prisma.supportTicket.update({ where: { id }, data });
  return getAny(prisma, id);
}

async function stats(prisma) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [questions, solved, escalated, openTickets, tickets30] = await Promise.all([
    prisma.supportChat.count({ where: { createdAt: { gte: since } } }),
    prisma.supportChat.count({ where: { createdAt: { gte: since }, resolved: true } }),
    prisma.supportChat.count({ where: { createdAt: { gte: since }, resolved: false } }),
    prisma.supportTicket.count({ where: { status: "open" } }),
    prisma.supportTicket.count({ where: { createdAt: { gte: since } } }),
  ]);
  return { questions, solved, escalated, openTickets, tickets30 };
}

module.exports = { STATUSES, PRIORITIES, create, listForStore, getForStore, sellerReply, sellerResolve, listAll, getAny, teamReply, update, stats, ticketNo };
