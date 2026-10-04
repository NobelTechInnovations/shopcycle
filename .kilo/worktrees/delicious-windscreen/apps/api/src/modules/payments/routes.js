const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const service = require("./service");
const { PROVIDER_KEYS } = require("./providers");

/** Settings ▸ Payments. Where the store's money goes — owners and admins only. */
async function paymentRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);

  const manager = (request) => {
    if (request.storeRole === "staff") throw new HttpError(403, "Only the store owner or an admin can change payments.");
  };
  const providerParam = z.object({ provider: z.enum(PROVIDER_KEYS) });

  fastify.get("/", async (request) => service.listForAdmin(fastify.prisma, request.store));

  fastify.put("/cod", async (request) => {
    manager(request);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    return service.setCod(fastify.prisma, request.store, enabled);
  });

  fastify.put("/:provider", async (request) => {
    manager(request);
    const { provider } = providerParam.parse(request.params);
    const body = z
      .object({ credentials: z.record(z.string().max(500)).default({}), testMode: z.boolean().optional(), enabled: z.boolean().optional() })
      .parse(request.body);
    return service.save(fastify.prisma, request.store, provider, body);
  });

  fastify.patch("/:provider", async (request) => {
    manager(request);
    const { provider } = providerParam.parse(request.params);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    return service.setEnabled(fastify.prisma, request.store, provider, enabled);
  });

  fastify.delete("/:provider", async (request) => {
    manager(request);
    const { provider } = providerParam.parse(request.params);
    return service.remove(fastify.prisma, request.store, provider);
  });
}

module.exports = paymentRoutes;
