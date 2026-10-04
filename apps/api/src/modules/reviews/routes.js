const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const service = require("./service");

/** Apps ▸ Product Reviews: moderation, settings and CSV import. */
async function reviewRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  const db = fastify.prisma;
  const manager = (request) => {
    if (request.storeRole === "staff") throw new HttpError(403, "Only the store owner or an admin can change review settings.");
  };

  fastify.get("/", async (request) => {
    const settings = await service.requireInstalled(db, request.store.id);
    const q = z
      .object({ status: z.string().optional(), q: z.string().max(100).optional(), page: z.coerce.number().int().positive().default(1) })
      .parse(request.query);
    return { settings, ...(await service.list(db, request.store.id, q)) };
  });

  fastify.put("/settings", async (request) => {
    manager(request);
    return { settings: await service.saveSettings(db, request.store.id, request.body || {}) };
  });

  fastify.patch("/:id", async (request) => {
    await service.requireInstalled(db, request.store.id);
    const body = z.object({ status: z.string().optional(), reply: z.string().max(2000).nullable().optional() }).parse(request.body);
    return { review: await service.update(db, request.store.id, request.params.id, body) };
  });

  fastify.post("/bulk", async (request) => {
    await service.requireInstalled(db, request.store.id);
    const { ids, action } = z.object({ ids: z.array(z.string().max(40)).max(500), action: z.string() }).parse(request.body);
    const { count } = await service.bulk(db, request.store.id, ids, action);
    return { count };
  });

  fastify.delete("/:id", async (request) => {
    await service.requireInstalled(db, request.store.id);
    await service.remove(db, request.store.id, request.params.id);
    return { ok: true };
  });

  // The CSV's text (read in the browser) — up to a few MB.
  fastify.post("/import", { bodyLimit: 6 * 1024 * 1024 }, async (request) => {
    manager(request);
    const { csv } = z.object({ csv: z.string().min(1).max(6 * 1024 * 1024) }).parse(request.body);
    return service.importCsv(db, request.store.id, csv);
  });
}

module.exports = reviewRoutes;
