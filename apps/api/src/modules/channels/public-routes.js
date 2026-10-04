const feed = require("./feed");

/**
 * /api/public/feeds/:storeId/:token/(google.xml|facebook.csv) — the
 * product feeds Google Merchant Center and Meta fetch on a schedule. No
 * login: the token in the path is the secret (feed.js). Cached briefly.
 */
async function feedRoutes(fastify) {
  const { prisma } = fastify;

  async function storeFor(request, reply) {
    const { storeId, token } = request.params;
    if (!feed.validToken(storeId, token)) {
      reply.code(404).send("Not found");
      return null;
    }
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      reply.code(404).send("Not found");
      return null;
    }
    return store;
  }

  fastify.get("/:storeId/:token/google.xml", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const store = await storeFor(request, reply);
    if (!store) return reply;
    const { items } = await feed.buildItems(prisma, store, "google");
    reply.header("content-type", "application/xml; charset=utf-8").header("cache-control", "public, max-age=600").send(feed.googleXml(store, items));
    return reply;
  });

  fastify.get("/:storeId/:token/facebook.csv", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const store = await storeFor(request, reply);
    if (!store) return reply;
    const { items } = await feed.buildItems(prisma, store, "facebook");
    reply.header("content-type", "text/csv; charset=utf-8").header("cache-control", "public, max-age=600").send(feed.facebookCsv(items));
    return reply;
  });
}

module.exports = feedRoutes;
