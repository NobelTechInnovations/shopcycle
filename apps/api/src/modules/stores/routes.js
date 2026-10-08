const { HttpError } = require("@shopcycle/utils");
const controller = require("./controller");
const storeEmail = require("../store-email/service");

/** The current store's own settings. Billing lives in modules/billing
 * (/api/billing). */
async function storeRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);

  fastify.get("/", controller.getStoreHandler);
  fastify.patch("/", controller.updateStoreHandler);

  // Settings ▸ Notifications ▸ your own email server (Pro).
  const manager = (request) => {
    if (request.storeRole === "staff") throw new HttpError(403, "Only the store owner or an admin can change the email server.");
  };
  fastify.get("/smtp", async (request) => storeEmail.forAdmin(fastify.prisma, request.store));
  fastify.put("/smtp", async (request) => {
    manager(request);
    return storeEmail.save(fastify.prisma, request.store, request.body);
  });
  fastify.post("/smtp/test", { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (request) => {
    manager(request);
    return storeEmail.sendTest(fastify.prisma, request.store, request.body?.to);
  });
}

module.exports = storeRoutes;
