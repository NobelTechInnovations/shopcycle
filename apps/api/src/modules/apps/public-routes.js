const repository = require("./repository");
const { num } = require("../billing/money");

/**
 * GET /api/public/apps — the app catalog for the marketing site's Apps page
 * (apps/www), no sign-in. Only what a visitor may see: names, descriptions,
 * prices — never settings or anything about a store.
 */
const PLAN_APPS = new Set(["meta-ads", "whatsapp"]);

async function publicAppsRoutes(fastify) {
  fastify.get("/apps", async (request, reply) => {
    const catalog = await repository.listCatalog(fastify.prisma);
    reply.header("cache-control", "public, max-age=60");
    return {
      apps: catalog.map((a) => ({
        key: a.key,
        name: a.name,
        description: a.description,
        category: a.category,
        iconKey: a.iconKey,
        priceMonthly: num(a.priceMonthly) > 0 ? num(a.priceMonthly) : null,
        premium: PLAN_APPS.has(a.key),
      })),
    };
  });
}

module.exports = publicAppsRoutes;
