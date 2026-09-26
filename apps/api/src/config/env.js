require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
const { z } = require("zod");

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET should be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  COOKIE_NAME: z.string().default("shopcycle_session"),
  // Without this, the session cookie is host-only to whatever domain the
  // API itself runs on (api.oyklane.com) — the browser then never sends it
  // to store.oyklane.com or superadmin.oyklane.com's own servers, so their
  // server-side auth checks (serverApiFetch forwarding cookies to the API)
  // see no cookie at all and bounce every request back to /login, even
  // though the client-side session is genuinely valid. Set to ".oyklane.com"
  // in production to share the cookie across every subdomain; left unset in
  // dev, where a Domain attribute on "localhost" behaves inconsistently
  // across browsers and isn't needed anyway (dev already works without it).
  COOKIE_DOMAIN: z.string().optional(),
  // A completely separate cookie for the platform-admin panel — sharing
  // one cookie between it and the seller admin (both now under
  // Domain=.oyklane.com) meant logging into either one silently also
  // half-authenticated the other, since both read the exact same JWT.
  // Two independent cookies means logging into one never touches the
  // other's session at all, by construction, not by convention.
  SUPER_ADMIN_COOKIE_NAME: z.string().default("shopcycle_superadmin_session"),
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
  // Platform billing (Phase 9) — merchants paying us monthly, via the same
  // Razorpay account/keys above but the Subscriptions product rather than
  // one-off Orders. RAZORPAY_WEBHOOK_SECRET is the separate secret Razorpay
  // gives you when you register the webhook URL in their dashboard
  // (Settings ▸ Webhooks) — required to trust a webhook call actually came
  // from Razorpay rather than anyone who finds the URL.
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  // Only ever changed to point the billing flows at a local mock in tests.
  RAZORPAY_API_URL: z.string().default("https://api.razorpay.com/v1"),
  // Local development only: with no Razorpay keys, "true" lets a merchant
  // pick a plan without a mandate (the free trial just starts) so the
  // billing screens and Premium features can be tried. Ignored whenever
  // Razorpay keys are set, and the API refuses to boot with it in
  // production — see the check at the bottom of this file.
  BILLING_SANDBOX: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),

  // Outgoing email over SMTP — every provider offers it (Resend, Brevo,
  // Amazon SES, Zoho, Gmail), so switching provider is a config change.
  // With SMTP_HOST unset nothing is sent: each email is kept in the email
  // log (platform console ▸ Emails) so local development needs no account.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // "true" for implicit TLS on port 465; leave false for STARTTLS on 587.
  SMTP_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  // The address everything is sent from. Store emails go out as
  // "<Store name> <this address>" with Reply-To set to the store's own
  // support email, so shoppers' replies reach the merchant.
  EMAIL_FROM: z.string().default("Oyklane <no-reply@oyklane.com>"),

  // Background jobs (jobs.js): abandoned-checkout reminders. A shopper who
  // reached checkout and left their email gets one reminder this many
  // minutes later if they haven't ordered.
  ABANDONED_CHECKOUT_DELAY_MINUTES: z.coerce.number().int().min(0).default(60),
  JOBS_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(300),
  JOBS_DISABLED: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),

  // Oyklane's own details, printed as the seller on every GST invoice to
  // merchants (billing/invoices.js). PLATFORM_STATE decides CGST+SGST vs
  // IGST: a merchant in the same state is charged CGST+SGST, anyone else
  // IGST. Leave PLATFORM_GSTIN empty until registered — invoices then say
  // so instead of printing a made-up number.
  PLATFORM_LEGAL_NAME: z.string().default("Oyklane"),
  PLATFORM_GSTIN: z.string().optional(),
  PLATFORM_ADDRESS: z.string().optional(),
  PLATFORM_STATE: z.string().default("Maharashtra"),
  // SAC (services accounting code) printed on invoices — confirm the right
  // code for your registration with your CA; the column is hidden until set.
  PLATFORM_SAC: z.string().optional(),

  // Meta (Facebook) Login for Business — one OAuth app backs both the
  // "Meta Ads" and "WhatsApp" integrations (see MetaConnection's doc
  // comment in schema.prisma). Created once in Meta's own developer
  // console (developers.facebook.com/apps); optional the same way
  // Razorpay's keys are — the Connect screen just explains it isn't set
  // up yet rather than the API failing to boot.
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  // Where Meta redirects back after the merchant approves access —
  // must exactly match one of the "Valid OAuth Redirect URIs" configured
  // on the Meta app. Points at the admin app, not the API, since that's
  // where the Connect UI lives; the API only ever receives the resulting
  // `code` as a query param forwarded from there.
  META_OAUTH_REDIRECT_URI: z.string().default("http://localhost:3000/admin/apps/meta/callback"),
  // Pinned rather than left to "latest" so a Graph API version bump
  // upstream can't silently change response shapes under us.
  META_GRAPH_API_VERSION: z.string().default("v21.0"),

  // AES-256 key (64 hex chars) for encrypting third-party secrets at rest —
  // e.g. each store's Meta access token (see lib/crypto.js). Optional so
  // dev works without setup; production should always set its own.
  DATA_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "DATA_ENCRYPTION_KEY must be 64 hex characters (32 bytes)")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  // Behind a reverse proxy (Hostinger's LiteSpeed, Vercel, a load
  // balancer) every request arrives from the proxy's own IP, so per-IP rate
  // limits would lump all users together. "true" makes Fastify read the
  // real client IP from X-Forwarded-For. Leave off when the API is exposed
  // directly — then that header is attacker-controlled.
  TRUST_PROXY: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// Free plans for everyone is not a mistake a production deploy gets to make.
if (parsed.data.BILLING_SANDBOX && parsed.data.NODE_ENV === "production") {
  console.error("BILLING_SANDBOX=true is not allowed when NODE_ENV=production. Remove it and set the Razorpay keys.");
  process.exit(1);
}

module.exports = { env: parsed.data };
