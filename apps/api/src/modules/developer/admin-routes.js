const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { actorNameFrom } = require("../orders/events");
const keys = require("./api-keys");
const webhooks = require("./webhooks");

/** Settings ▸ API & webhooks — owners and admins only (keys can read
 * customer data and change the store). */
async function developerAdminRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", async (request) => {
    if (request.storeRole === "staff") throw new HttpError(403, "Only the store owner or an admin can manage API keys and webhooks.");
  });
  // Listing stays open (to see and revoke old keys); creating needs Pro.
  const proOnly = { preHandler: fastify.requirePlanFeature("api_access") };
  const db = fastify.prisma;

  fastify.get("/keys", async (request) => keys.list(db, request.store.id));
  fastify.post("/keys", proOnly, async (request, reply) => {
    const body = z.object({ name: z.string().trim().min(1, "Name the key").max(80), scopes: z.array(z.string()).min(1).max(20) }).parse(request.body);
    reply.header("cache-control", "no-store");
    reply.code(201).send(await keys.create(db, request.store.id, body, { actorName: actorNameFrom(request) }));
  });
  fastify.delete("/keys/:id", async (request) => {
    await keys.revoke(db, request.store.id, request.params.id);
    return { ok: true };
  });

  fastify.get("/webhooks", async (request) => webhooks.list(db, request.store.id));
  fastify.post("/webhooks", proOnly, async (request, reply) => {
    const body = z.object({ url: z.string().trim().max(500), events: z.array(z.string()).min(1).max(20) }).parse(request.body);
    reply.header("cache-control", "no-store");
    reply.code(201).send(await webhooks.create(db, request.store.id, body));
  });
  fastify.patch("/webhooks/:id", async (request) => {
    const body = z.object({ url: z.string().trim().max(500).optional(), events: z.array(z.string()).max(20).optional(), enabled: z.boolean().optional() }).parse(request.body);
    return { endpoint: await webhooks.update(db, request.store.id, request.params.id, body) };
  });
  fastify.delete("/webhooks/:id", async (request) => {
    await webhooks.remove(db, request.store.id, request.params.id);
    return { ok: true };
  });
  fastify.post("/webhooks/:id/test", async (request) => ({ delivery: await webhooks.ping(db, request.store.id, request.params.id) }));
  fastify.post("/deliveries/:id/redeliver", async (request) => ({ delivery: await webhooks.redeliver(db, request.store.id, request.params.id) }));
}

module.exports = developerAdminRoutes;
