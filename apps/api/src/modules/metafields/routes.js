const { HttpError } = require("@shopcycle/utils");
const service = require("./service");

/** Settings ▸ Custom data. Everyone on the team can read the definitions
 * (the product form needs them); only the owner or an admin can change them. */
async function metafieldRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  const db = fastify.prisma;
  const ownerOnly = async (request) => {
    if (request.storeRole === "staff") throw new HttpError(403, "Only the store owner or an admin can change custom data fields.");
  };

  fastify.get("/", async (request) => {
    const ownerType = request.query.owner || "product";
    return { types: service.TYPES, definitions: await service.list(db, request.store.id, ownerType) };
  });
  fastify.post("/", { preHandler: ownerOnly }, async (request, reply) => {
    reply.code(201);
    return { definition: await service.create(db, request.store.id, request.body || {}) };
  });
  fastify.put("/order", { preHandler: ownerOnly }, async (request) => {
    const { ownerType, ids } = request.body || {};
    return { definitions: await service.reorder(db, request.store.id, ownerType, Array.isArray(ids) ? ids : []) };
  });
  fastify.patch("/:id", { preHandler: ownerOnly }, async (request) => ({ definition: await service.update(db, request.store.id, request.params.id, request.body || {}) }));
  fastify.delete("/:id", { preHandler: ownerOnly }, async (request) => {
    await service.remove(db, request.store.id, request.params.id);
    return { ok: true };
  });
}

module.exports = metafieldRoutes;
