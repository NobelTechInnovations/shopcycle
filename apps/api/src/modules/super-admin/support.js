const { z } = require("zod");
const { HttpError, slugify } = require("@shopcycle/utils");
const ai = require("../../lib/ai");
const { env } = require("../../config/env");
const tickets = require("../support/tickets");
const articles = require("../support/articles");
const { getSupportSettings, saveSupportSettings, modelFor, inboxFor } = require("../support/settings");

/**
 * /api/super-admin/support — seller tickets, the help-centre articles the
 * assistant answers from, and the assistant's settings. Inherits the
 * super-admin auth hooks and the audit log from routes.js.
 */

const articleSchema = z.object({
  title: z.string().trim().min(3).max(160),
  slug: z.string().trim().max(80).optional(),
  category: z.string().trim().max(40).default("general"),
  body: z.string().trim().min(10).max(20000),
  keywords: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  published: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
});

async function supportAdminRoutes(fastify) {
  const { prisma } = fastify;

  fastify.get("/overview", async () => {
    const settings = await getSupportSettings(prisma);
    return {
      stats: await tickets.stats(prisma),
      assistant: { configured: ai.aiConfigured(), enabled: settings.aiEnabled, model: modelFor(settings), defaultModel: env.SUPPORT_AI_MODEL },
      inbox: await inboxFor(prisma, settings),
    };
  });

  // ── Tickets ────────────────────────────────────────────────────────
  fastify.get("/tickets", async (request) => {
    const q = z
      .object({ status: z.string().max(20).optional(), q: z.string().max(100).optional(), page: z.coerce.number().int().min(1).default(1) })
      .parse(request.query || {});
    return tickets.listAll(prisma, q);
  });

  fastify.get("/tickets/:id", async (request) => ({ ticket: await tickets.getAny(prisma, request.params.id) }));

  fastify.post("/tickets/:id/reply", async (request) => {
    const body = z.object({ body: z.string().max(10000), status: z.enum(tickets.STATUSES).optional() }).parse(request.body || {});
    return { ticket: await tickets.teamReply(prisma, request.currentUser, request.params.id, body, { log: request.log }) };
  });

  fastify.patch("/tickets/:id", async (request) => {
    const body = z.object({ status: z.string().optional(), priority: z.string().optional(), category: z.string().optional() }).parse(request.body || {});
    return { ticket: await tickets.update(prisma, request.params.id, body) };
  });

  // ── Articles ───────────────────────────────────────────────────────
  fastify.get("/articles", async () => ({
    articles: await prisma.supportArticle.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
    categories: articles.CATEGORIES,
  }));

  fastify.post("/articles", async (request, reply) => {
    const data = articleSchema.parse(request.body || {});
    const slug = slugify(data.slug || data.title).slice(0, 80);
    if (await prisma.supportArticle.findUnique({ where: { slug } })) throw new HttpError(400, "An article with that link already exists.");
    const created = await prisma.supportArticle.create({ data: { ...data, slug, sortOrder: data.sortOrder ?? 500 } });
    reply.code(201);
    return { article: created };
  });

  fastify.patch("/articles/:id", async (request) => {
    const data = articleSchema.partial().parse(request.body || {});
    if (data.slug !== undefined) {
      data.slug = slugify(data.slug).slice(0, 80);
      const other = await prisma.supportArticle.findUnique({ where: { slug: data.slug } });
      if (other && other.id !== request.params.id) throw new HttpError(400, "An article with that link already exists.");
    }
    const found = await prisma.supportArticle.findUnique({ where: { id: request.params.id } });
    if (!found) throw new HttpError(404, "Article not found");
    return { article: await prisma.supportArticle.update({ where: { id: found.id }, data }) };
  });

  fastify.delete("/articles/:id", async (request, reply) => {
    const { count } = await prisma.supportArticle.deleteMany({ where: { id: request.params.id } });
    if (!count) throw new HttpError(404, "Article not found");
    reply.code(204);
  });

  // Which articles a question would find — to check the assistant will see the right ones.
  fastify.get("/articles-search", async (request) => {
    const q = String(request.query?.q || "").slice(0, 200);
    return { articles: (await articles.search(prisma, q, 5)).map((x) => ({ id: x.id, slug: x.slug, title: x.title })) };
  });

  // ── Assistant settings ─────────────────────────────────────────────
  fastify.get("/settings", async () => ({ settings: await getSupportSettings(prisma), configured: ai.aiConfigured(), defaultModel: env.SUPPORT_AI_MODEL }));

  fastify.put("/settings", async (request) => {
    const body = z
      .object({
        aiEnabled: z.boolean().optional(),
        model: z.string().max(80).optional(),
        instructions: z.string().max(4000).optional(),
        inbox: z.union([z.literal(""), z.string().email()]).optional(),
        replyPromise: z.string().max(80).optional(),
        suggestions: z.array(z.string().max(140)).max(8).optional(),
        categories: z.array(z.object({ key: z.string().max(40).optional(), label: z.string().max(60) })).max(20).optional(),
      })
      .parse(request.body || {});
    return { settings: await saveSupportSettings(prisma, body, request.currentUser.id) };
  });

  // Recent questions sellers asked — what the help centre is missing.
  fastify.get("/questions", async () => {
    const chats = await prisma.supportChat.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { store: { select: { name: true } } } });
    return {
      questions: chats.map((c) => ({
        id: c.id,
        store: c.store?.name,
        question: (Array.isArray(c.messages) ? c.messages : []).find((m) => m.role === "user")?.content || "",
        turns: (Array.isArray(c.messages) ? c.messages : []).filter((m) => m.role === "user").length,
        resolved: c.resolved,
        ticketId: c.ticketId,
        createdAt: c.createdAt,
      })),
    };
  });
}

module.exports = supportAdminRoutes;
