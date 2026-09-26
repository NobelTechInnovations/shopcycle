const controller = require("./controller");
const service = require("./service");
const growth = require("./growth");

// Public — no auth. This is what apps/storefront calls to get rendered
// HTML and raw theme assets for anonymous visitors.
async function storefrontRoutes(fastify) {
  fastify.get("/resolve-domain", controller.resolveDomainHandler);
  fastify.get("/platform-assets/:file", controller.platformAssetHandler);

  // Growth (growth.js): search engines and newsletter signups.
  fastify.get("/:handle/robots.txt", async (request, reply) => {
    const store = await service.loadStoreOrThrow(fastify.prisma, request.params.handle);
    reply.header("content-type", "text/plain; charset=utf-8").header("cache-control", "public, max-age=3600").send(growth.robotsTxt(store));
  });
  fastify.get("/:handle/sitemap.xml", async (request, reply) => {
    const store = await service.loadStoreOrThrow(fastify.prisma, request.params.handle);
    reply.header("content-type", "application/xml; charset=utf-8").header("cache-control", "public, max-age=900").send(await growth.sitemapXml(fastify.prisma, store));
  });
  fastify.post("/:handle/newsletter", { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } }, async (request, reply) => {
    const store = await service.loadStoreOrThrow(fastify.prisma, request.params.handle);
    reply.send(await growth.subscribe(fastify, store, request.body));
  });
  fastify.get("/:handle/render/:template", controller.renderHandler);
  fastify.get("/:handle/assets/:themeId/*", controller.assetHandler);
}

module.exports = storefrontRoutes;
