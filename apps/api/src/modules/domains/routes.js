const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const service = require("./service");

/** Settings ▸ Domains. Changing where the store lives is for owners and admins. */
async function domainRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);

  const manager = (request) => {
    if (request.storeRole === "staff") throw new HttpError(403, "Only the store owner or an admin can change domains.");
  };

  fastify.get("/", async (request) => service.status(fastify.prisma, request.store));

  fastify.put("/", async (request) => {
    manager(request);
    const { domain } = z.object({ domain: z.string().trim().min(1, "Enter a domain").max(253) }).parse(request.body);
    return service.connect(fastify.prisma, request.store, domain);
  });

  fastify.delete("/", async (request) => {
    manager(request);
    return service.disconnect(fastify.prisma, request.store);
  });
}

module.exports = domainRoutes;
