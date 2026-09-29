const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { throttle } = require("../../lib/throttle");
const ai = require("../../lib/ai");
const articles = require("./articles");
const assistant = require("./assistant");
const tickets = require("./tickets");
const { getSupportSettings } = require("./settings");

/**
 * /api/support — the seller's Help: the assistant, the help centre and
 * their tickets. Signed-in store users only; deliberately not behind the
 * subscription check, since a locked store is exactly when a seller most
 * needs help.
 */

const articleCard = (x) => ({ slug: x.slug, title: x.title, category: x.category });

async function supportRoutes(fastify) {
  const { prisma } = fastify;
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);

  fastify.get("/config", async () => {
    const settings = await getSupportSettings(prisma);
    return {
      ai: settings.aiEnabled && ai.aiConfigured(),
      suggestions: settings.suggestions,
      categories: settings.categories,
      articleCategories: articles.CATEGORIES,
      replyPromise: settings.replyPromise,
    };
  });

  // ── Help centre ────────────────────────────────────────────────────
  fastify.get("/articles", async (request) => {
    const q = String(request.query?.q || "").trim().slice(0, 200);
    const list = q
      ? await articles.search(prisma, q, 12)
      : await prisma.supportArticle.findMany({ where: { published: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
    return { articles: list.map((x) => ({ ...articleCard(x), excerpt: x.body.replace(/[*#[\]()]/g, "").split("\n").find((l) => l.trim().length > 30)?.trim().slice(0, 160) || "" })), categories: articles.CATEGORIES };
  });

  fastify.get("/articles/:slug", async (request) => {
    const art = await prisma.supportArticle.findFirst({ where: { slug: request.params.slug, published: true } });
    if (!art) throw new HttpError(404, "Article not found");
    await prisma.supportArticle.update({ where: { id: art.id }, data: { views: { increment: 1 } } }).catch(() => {});
    const related = (await articles.search(prisma, `${art.title} ${(art.keywords || []).slice(0, 4).join(" ")}`, 4)).filter((x) => x.id !== art.id).slice(0, 3);
    return { article: { ...articleCard(art), body: art.body, updatedAt: art.updatedAt }, related: related.map(articleCard) };
  });

  fastify.post("/articles/:slug/feedback", async (request) => {
    const { helpful } = z.object({ helpful: z.boolean() }).parse(request.body || {});
    await prisma.supportArticle.updateMany({ where: { slug: request.params.slug }, data: helpful ? { helpful: { increment: 1 } } : { notHelpful: { increment: 1 } } });
    return { ok: true };
  });

  // ── Assistant ──────────────────────────────────────────────────────
  // Streams newline-delimited JSON: start → delta… → done (or error).
  fastify.post("/ask", async (request, reply) => {
    const body = z.object({ question: z.string().max(2000), chatId: z.string().max(40).optional().nullable() }).parse(request.body || {});
    await throttle(fastify, `support-ask:${request.currentUser.id}`, { max: 40, windowSeconds: 60 * 60, message: "You've asked a lot this hour — open a ticket and the team will help." });
    const prep = await assistant.prepare(prisma, request.store, request.currentUser, body);

    // The seller closed Help mid-answer: stop asking the AI. (The response's
    // close, not the request's — that one fires as soon as the body is read.)
    const controller = new AbortController();
    reply.raw.on("close", () => {
      if (!reply.raw.writableFinished) controller.abort();
    });
    reply.hijack();
    reply.raw.writeHead(200, {
      ...reply.getHeaders(),
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    });
    const send = (obj) => reply.raw.write(`${JSON.stringify(obj)}\n`);
    send({ type: "start", chatId: prep.chat.id, ai: prep.useAi, articles: prep.found.map(articleCard) });
    let text = "";
    try {
      for await (const piece of assistant.answer(prep, { signal: controller.signal, log: request.log })) {
        text += piece;
        send({ type: "delta", text: piece });
      }
      await assistant.saveAnswer(prisma, prep.chat.id, text, prep.found);
      send({ type: "done" });
    } catch (err) {
      request.log.warn({ err }, "support: answer stream failed");
      send({ type: "error", message: "Something went wrong answering that. Try again, or open a ticket." });
    } finally {
      reply.raw.end();
    }
  });

  fastify.post("/chats/:id/feedback", async (request) => {
    const { resolved } = z.object({ resolved: z.boolean() }).parse(request.body || {});
    const { count } = await prisma.supportChat.updateMany({ where: { id: request.params.id, storeId: request.store.id, userId: request.currentUser.id }, data: { resolved } });
    if (!count) throw new HttpError(404, "Conversation not found");
    return { ok: true };
  });

  // ── Tickets ────────────────────────────────────────────────────────
  fastify.get("/tickets", async (request) => ({ tickets: await tickets.listForStore(prisma, request.store, { status: request.query?.status }) }));

  fastify.post("/tickets", async (request, reply) => {
    const body = z
      .object({
        subject: z.string().max(200),
        body: z.string().max(8000),
        category: z.string().max(40).optional(),
        priority: z.string().max(10).optional(),
        chatId: z.string().max(40).optional().nullable(),
      })
      .parse(request.body || {});
    await throttle(fastify, `support-ticket:${request.store.id}`, { max: 10, windowSeconds: 60 * 60, message: "Too many new tickets this hour — reply on an existing one instead." });
    const ticket = await tickets.create(prisma, request.store, request.currentUser, body, { log: request.log });
    reply.code(201);
    return { ticket };
  });

  fastify.get("/tickets/:id", async (request) => ({ ticket: await tickets.getForStore(prisma, request.store, request.params.id) }));

  fastify.post("/tickets/:id/messages", async (request) => {
    const { body } = z.object({ body: z.string().max(8000) }).parse(request.body || {});
    await throttle(fastify, `support-reply:${request.store.id}`, { max: 60, windowSeconds: 60 * 60 });
    return { ticket: await tickets.sellerReply(prisma, request.store, request.currentUser, request.params.id, body, { log: request.log }) };
  });

  fastify.post("/tickets/:id/resolve", async (request) => ({ ticket: await tickets.sellerResolve(prisma, request.store, request.params.id) }));
}

module.exports = supportRoutes;
