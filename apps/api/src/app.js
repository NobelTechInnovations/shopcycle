const Fastify = require("fastify");
const cors = require("@fastify/cors");
const multipart = require("@fastify/multipart");
const fastifyStatic = require("@fastify/static");
const { ZodError } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("./config/env");
const { UPLOADS_ROOT } = require("./config/paths");

const prismaPlugin = require("./plugins/prisma");
const jwtAuthPlugin = require("./plugins/jwt-auth");
const redisPlugin = require("./plugins/redis");

const authRoutes = require("./modules/auth/routes");
const storeRoutes = require("./modules/stores/routes");
const dashboardRoutes = require("./modules/dashboard/routes");
const productRoutes = require("./modules/products/routes");
const collectionRoutes = require("./modules/collections/routes");
const orderRoutes = require("./modules/orders/routes");
const customerRoutes = require("./modules/customers/routes");
const themeRoutes = require("./modules/themes/routes");
const storefrontRoutes = require("./modules/storefront/routes");
const cartRoutes = require("./modules/cart/routes");
const checkoutRoutes = require("./modules/checkout/routes");
const discountRoutes = require("./modules/discounts/routes");
const shippingRoutes = require("./modules/shipping/routes");
const taxRoutes = require("./modules/taxes/routes");
const pageRoutes = require("./modules/pages/routes");
const menuRoutes = require("./modules/menus/routes");
const uploadRoutes = require("./modules/uploads/routes");
const teamRoutes = require("./modules/team/routes");
const analyticsRoutes = require("./modules/analytics/routes");
const superAdminRoutes = require("./modules/super-admin/routes");
const appsRoutes = require("./modules/apps/routes");

function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "development" ? "info" : "warn",
      transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
    },
  });

  // Admin and super-admin both need credentialed CORS (cookie session) —
  // super-admin is a fully separate domain in production (adminshopcycle.com),
  // not a subdomain, so it must be listed explicitly, not inferred. The
  // storefront app's server-to-server calls don't send browser cookies at
  // all, but it's still listed so a future client-side fetch isn't blocked.
  app.register(cors, {
    origin: [env.ADMIN_ORIGIN, env.STOREFRONT_ORIGIN, env.SUPER_ADMIN_ORIGIN],
    credentials: true,
  });
  app.register(prismaPlugin);
  app.register(jwtAuthPlugin);
  app.register(redisPlugin);
  app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } });
  app.register(fastifyStatic, { root: UPLOADS_ROOT, prefix: "/uploads/", decorateReply: false });

  app.get("/health", async () => ({ ok: true, service: "@shopcycle/api" }));

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(storeRoutes, { prefix: "/api/store" });
  app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  app.register(productRoutes, { prefix: "/api/products" });
  app.register(collectionRoutes, { prefix: "/api/collections" });
  app.register(orderRoutes, { prefix: "/api/orders" });
  app.register(customerRoutes, { prefix: "/api/customers" });
  app.register(themeRoutes, { prefix: "/api/themes" });
  app.register(storefrontRoutes, { prefix: "/api/storefront" });
  app.register(cartRoutes, { prefix: "/api/storefront" });
  app.register(checkoutRoutes, { prefix: "/api/storefront" });
  app.register(discountRoutes, { prefix: "/api/discounts" });
  app.register(shippingRoutes, { prefix: "/api/shipping" });
  app.register(taxRoutes, { prefix: "/api/taxes" });
  app.register(pageRoutes, { prefix: "/api/pages" });
  app.register(menuRoutes, { prefix: "/api/menus" });
  app.register(uploadRoutes, { prefix: "/api/files" });
  app.register(teamRoutes, { prefix: "/api/team" });
  app.register(analyticsRoutes, { prefix: "/api/analytics" });
  app.register(superAdminRoutes, { prefix: "/api/super-admin" });
  app.register(appsRoutes, { prefix: "/api/apps" });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({
        error: "Validation failed",
        details: error.flatten().fieldErrors,
      });
      return;
    }

    if (error instanceof HttpError) {
      reply.code(error.statusCode).send({ error: error.message, details: error.details });
      return;
    }

    request.log.error(error);
    reply.code(error.statusCode || 500).send({ error: "Internal server error" });
  });

  return app;
}

module.exports = { buildApp };
