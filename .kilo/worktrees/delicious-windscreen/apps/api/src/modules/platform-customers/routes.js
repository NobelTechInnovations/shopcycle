const controller = require("./controller");

/** Super-admin only, deliberately — a store's own admin session
 * (authenticate/loadStoreContext) has no route into this data at all; the
 * cross-store view exists exclusively for the platform operator. See
 * PlatformCustomer's doc comment in schema.prisma for scope/limits. */
async function platformCustomersRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticateSuperAdmin);
  fastify.addHook("preHandler", fastify.requireSuperAdmin);

  fastify.get("/", controller.searchHandler);
  fastify.get("/:id", controller.getHandler);
}

module.exports = platformCustomersRoutes;
