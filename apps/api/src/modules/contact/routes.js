const { z } = require("zod");
const service = require("./service");

/** Customers ▸ Queries: messages from the store's Contact page. */
async function contactRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);
  const db = fastify.prisma;

  fastify.get("/", async (request) => {
    const q = z
      .object({ status: z.string().max(20).optional(), q: z.string().max(100).optional(), page: z.coerce.number().int().positive().default(1) })
      .parse(request.query);
    return service.list(db, request.store.id, q);
  });

  // The sidebar's count of unread messages.
  fastify.get("/unread", async (request) => ({ count: await service.unread(db, request.store.id) }));

  fastify.patch("/:id", async (request) => {
    const { status } = z.object({ status: z.string() }).parse(request.body);
    return { message: await service.setStatus(db, request.store.id, request.params.id, status) };
  });

  fastify.post("/:id/reply", async (request) => {
    const message = await service.reply(db, request.store, request.params.id, request.body?.body, { by: request.currentUser?.email, log: request.log });
    return { message };
  });

  fastify.delete("/:id", async (request) => {
    await service.remove(db, request.store.id, request.params.id);
    return { ok: true };
  });
}

module.exports = contactRoutes;
