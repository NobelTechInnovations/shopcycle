const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const service = require("./service");

/** Apps ▸ UPI QR: the seller's UPI ID, the payments to check, history. */
async function upiRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  const db = fastify.prisma;
  const manager = (request) => {
    if (request.storeRole === "staff") throw new HttpError(403, "Only the store owner or an admin can change where payments go.");
  };

  fastify.get("/", async (request) => {
    const q = z
      .object({ status: z.enum(["submitted", "confirmed", "rejected", "awaiting", "expired", "all"]).default("submitted"), q: z.string().max(100).optional(), page: z.coerce.number().int().positive().default(1) })
      .parse(request.query);
    return service.overview(db, request.store.id, q);
  });

  fastify.put("/settings", async (request) => {
    manager(request);
    return { settings: await service.saveSettings(db, request.store.id, request.body) };
  });

  // Bank-SMS matching: on makes a new secret link, off removes it.
  fastify.put("/auto-sms", async (request) => {
    manager(request);
    const { on } = z.object({ on: z.boolean() }).parse(request.body || {});
    return service.setAutoSms(db, request.store.id, on);
  });

  // A ₹1 sample QR, to test with a real UPI app.
  fastify.get("/preview", async (request) => ({ svg: await service.preview(db, request.store) }));

  fastify.post("/:id/confirm", async (request) => ({
    payment: await service.confirm(db, request.store, request.params.id, { by: request.currentUser?.email, log: request.log }),
  }));

  fastify.post("/:id/reject", async (request) => ({
    payment: await service.reject(db, request.store, request.params.id, { by: request.currentUser?.email, actorName: request.currentUser?.name || request.currentUser?.email, log: request.log }),
  }));
}

module.exports = upiRoutes;
