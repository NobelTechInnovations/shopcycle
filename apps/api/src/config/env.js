require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
const { z } = require("zod");

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET should be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  COOKIE_NAME: z.string().default("shopcycle_session"),
  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  ADMIN_ORIGIN: z.string().default("http://localhost:3000"),
  STOREFRONT_ORIGIN: z.string().default("http://localhost:3002"),
  // Platform-operator panel — a fully separate app/domain (e.g.
  // adminshopcycle.com), not a route of the seller admin. Needs its own
  // CORS origin since it's a genuinely different registrable domain in
  // production, not just a different subdomain.
  SUPER_ADMIN_ORIGIN: z.string().default("http://localhost:3003"),
  API_PUBLIC_URL: z.string().default("http://localhost:4000"),
  // The bare domain every store's default storefront subdomain hangs off
  // of — {handle}.<this> — e.g. "oyklane.com" in production. Used only to
  // reject a merchant trying to "connect" a domain that's actually part of
  // that reserved namespace (see stores/controller.js); the storefront
  // app has its own copy of this same value for actual request routing.
  STOREFRONT_ROOT_DOMAIN: z.string().default("localhost"),
  NODE_ENV: z.string().default("development"),
  // Optional — online payments at checkout are only offered when both are
  // set (see checkout/service.js). Cash on Delivery works either way.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

module.exports = { env: parsed.data };
