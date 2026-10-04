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
  // A bare domain ("oyklane.com"). Tolerates a pasted URL or a leading dot.
  STOREFRONT_ROOT_DOMAIN: z
    .string()
    .default("localhost")
    .transform((v) => v.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/:]/)[0].replace(/^\.+|\.+$/g, "") || "localhost"),
  // Custom domains: where merchants point their DNS, and (optional) a Vercel
  // token so connecting a domain also adds it to the storefront project —
  // Vercel then issues its SSL certificate. Without the token the platform
  // operator adds each domain to the Vercel project by hand.
  STOREFRONT_CNAME_TARGET: z.string().default("cname.vercel-dns.com"),
  STOREFRONT_APEX_IP: z.string().default("76.76.21.21"),
  // Test-only: point the sellers' payment gateways at local mocks.
  CASHFREE_API_URL: z.string().optional(),
  PAYU_API_URL: z.string().optional(),
  STRIPE_API_URL: z.string().optional(),
  PAYPAL_API_URL: z.string().optional(),
  VERCEL_TOKEN: z.string().optional(),
  VERCEL_STOREFRONT_PROJECT_ID: z.string().optional(),
  VERCEL_TEAM_ID: z.string().optional(),
  NODE_ENV: z.string().default("development"),
  // Optional — online payments at checkout are only offered when both are
  // set (see checkout/service.js). Cash on Delivery works either way.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  // Platform billing (modules/billing) — sellers paying Oyklane, through
  // recurring payments on a mandate (UPI AutoPay, card or e-mandate) on the
  // same Razorpay account. RAZORPAY_WEBHOOK_SECRET is the secret Razorpay
  // gives you when you register https://<api>/api/webhooks/razorpay in
  // their dashboard (Settings ▸ Webhooks) — without it no webhook is
  // trusted, and payments are only picked up by the engine's polling.
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
  // The billing engine's timer (renewals, retries, locks, reminders).
  // Unset: on in production, off elsewhere — local and production share a
  // database, so a laptop must never bill real stores. "true" forces it on.
  BILLING_JOBS: z.enum(["true", "false"]).optional(),
  // Flow runs whose Wait is over are resumed by the jobs tick — production
  // only by default, for the same reason (jobs.js).
  FLOW_JOBS: z.enum(["true", "false"]).optional(),
  // Tests only: POST /api/billing/_test/clock runs the engine for the
  // caller's store at a chosen time. Never available in production.
  BILLING_TEST_CLOCK: z
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
  // Which service sends email (lib/mailer.js). Unset: "smtp" when SMTP_HOST
  // is set, otherwise "log". ZeptoMail and Brevo can also be used over SMTP
  // (Zoho Mail is SMTP only: smtp.zoho.in, port 465, SMTP_SECURE=true); their
  // HTTP APIs avoid hosts that block outbound SMTP ports.
  EMAIL_PROVIDER: z.enum(["smtp", "zeptomail", "brevo", "log"]).optional(),
  // ZeptoMail / Zoho CPaaS agent API key (SMTP/API ▸ API key). With or
  // without the "Zoho-enczapikey " prefix. ZOHO_CPAAS_TOKEN is the same key
  // (it also sends WhatsApp); either name works for email.
  ZEPTOMAIL_TOKEN: z.string().optional(),
  ZEPTOMAIL_API_URL: z.string().default("https://cpaas.zoho.in/v1.1/email"),
  BREVO_API_KEY: z.string().optional(),

  // The marketing site's home page shows the plans; when Super admin saves a
  // plan the API tells it to refresh at once (apps/www/app/api/revalidate).
  // Both unset: the site still refreshes its prices every minute.
  WWW_REVALIDATE_URL: z.string().optional(),
  REVALIDATE_SECRET: z.string().optional(),
  BREVO_API_URL: z.string().default("https://api.brevo.com/v3/smtp/email"),

  // The seller Help assistant (modules/support, lib/ai.js): NVIDIA's hosted
  // models (Nemotron 3 Ultra by default) or Claude. With neither key it
  // answers with the best-matching help articles instead. An "nvapi-" key is
  // used with NVIDIA even if it was saved as ANTHROPIC_API_KEY. The model
  // can be changed in Super admin ▸ Support ▸ Assistant.
  AI_PROVIDER: z.enum(["nvidia", "anthropic"]).optional(),
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_API_URL: z.string().default("https://integrate.api.nvidia.com/v1/chat/completions"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_API_URL: z.string().default("https://api.anthropic.com/v1/messages"),
  SUPPORT_AI_MODEL: z.string().optional(),
  // Where new seller tickets are emailed (also Super admin ▸ Support ▸ Assistant).
  SUPPORT_INBOX: z.string().optional(),

  // Where uploaded images are stored (modules/uploads). Unset: ImageKit when
  // its keys are set, else Cloudinary when its keys are set, else the
  // database. With ImageKit/Cloudinary the browser uploads straight to the
  // provider with a signature from the API; the file never passes through it.
  MEDIA_STORAGE: z.enum(["imagekit", "cloudinary", "database"]).optional(),
  IMAGEKIT_PUBLIC_KEY: z.string().optional(),
  IMAGEKIT_PRIVATE_KEY: z.string().optional(),
  // e.g. https://ik.imagekit.io/oyklane
  IMAGEKIT_URL_ENDPOINT: z.string().optional(),
  IMAGEKIT_FOLDER: z.string().default("/stores"),
  IMAGEKIT_UPLOAD_URL: z.string().default("https://upload.imagekit.io/api/v1/files/upload"),
  IMAGEKIT_API_URL: z.string().default("https://api.imagekit.io/v1"),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default("stores"),
  CLOUDINARY_API_URL: z.string().default("https://api.cloudinary.com/v1_1"),

  // One-time codes by SMS / WhatsApp (lib/messaging). Unset providers keep
  // every message in the message log instead of sending (development).
  SMS_PROVIDER: z.enum(["twilio", "msg91", "log"]).optional(),
  WHATSAPP_PROVIDER: z.enum(["zoho", "twilio", "meta", "log"]).optional(),
  // Zoho CPaaS WhatsApp: the agent's API key, the WhatsApp number (as shown
  // under the agent ▸ WhatsApp), an approved template's key, and the name
  // of that template's placeholder that holds the code.
  ZOHO_CPAAS_TOKEN: z.string().optional(),
  ZOHO_CPAAS_API_URL: z.string().default("https://cpaas.zoho.in/v1.1"),
  ZOHO_WHATSAPP_FROM: z.string().optional(),
  ZOHO_WHATSAPP_TEMPLATE_KEY: z.string().optional(),
  ZOHO_WHATSAPP_MERGE_KEY: z.string().default("code"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  // SMS sender: a Messaging Service SID (preferred) or a Twilio number.
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
  TWILIO_SMS_FROM: z.string().optional(),
  // e.g. +14155238886 (the "whatsapp:" prefix is added automatically).
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  // Approved WhatsApp content template with the code as variable {{1}} —
  // required to message someone outside a 24-hour conversation window.
  TWILIO_WHATSAPP_CONTENT_SID: z.string().optional(),
  TWILIO_API_URL: z.string().default("https://api.twilio.com/2010-04-01"),
  MSG91_AUTH_KEY: z.string().optional(),
  // DLT-approved flow/template id, and the variable name the code fills in it.
  MSG91_OTP_TEMPLATE_ID: z.string().optional(),
  MSG91_OTP_VAR: z.string().default("otp"),
  MSG91_API_URL: z.string().default("https://control.msg91.com/api/v5"),
  // WhatsApp Cloud API (Meta): a system-user token and the sending number's
  // phone_number_id, plus an approved "authentication" template.
  META_WHATSAPP_TOKEN: z.string().optional(),
  META_WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  META_WHATSAPP_OTP_TEMPLATE: z.string().optional(),
  META_WHATSAPP_OTP_LANGUAGE: z.string().default("en"),
  // Authentication templates with a "Copy code" button need the code there too.
  META_WHATSAPP_OTP_BUTTON: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  META_GRAPH_API_URL: z.string().default("https://graph.facebook.com"),
  // Phone sign-in guards against SMS-pumping fraud: codes only go to these
  // country codes (comma-separated), and at most this many per store a day.
  PHONE_LOGIN_COUNTRIES: z.string().default("91"),
  PHONE_LOGIN_DAILY_LIMIT: z.coerce.number().int().min(1).default(500),

  // "Continue with Google" for sellers and shoppers. Register
  // <API_PUBLIC_URL>/api/auth/google/callback and
  // <API_PUBLIC_URL>/api/shopper/google/callback as redirect URIs.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_URL: z.string().default("https://accounts.google.com/o/oauth2/v2/auth"),
  GOOGLE_TOKEN_URL: z.string().default("https://oauth2.googleapis.com/token"),

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
  // Optional: the permissions the one "Continue with Facebook" asks for,
  // comma-separated (defaults to every Meta app's — accounts/facebook.js).
  META_LOGIN_SCOPES: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  // Instagram feed app: an app on developers.facebook.com with the
  // "Instagram API with Instagram Login" product (instagram_business_basic).
  // Register <ADMIN_ORIGIN>/admin/apps/instagram as its redirect URI.
  // Without these a seller can still paste an access token.
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  INSTAGRAM_OAUTH_URL: z.string().default("https://www.instagram.com/oauth/authorize"),
  INSTAGRAM_API_URL: z.string().default("https://api.instagram.com"),
  INSTAGRAM_GRAPH_URL: z.string().default("https://graph.instagram.com"),
  // Google reviews app: a Google Cloud API key with "Places API (New)" on.
  // Tests point Google's API hosts at a mock: https://<host>/… becomes
  // <GOOGLE_API_BASE>/<host>/…. Unset in real use.
  GOOGLE_API_BASE: z.string().optional(),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  GOOGLE_PLACES_URL: z.string().default("https://places.googleapis.com/v1"),
  // Add the newest catalog apps (Instagram feed, Google reviews) when
  // running locally — off by default because local dev shares production's
  // database, and production adds them itself once its code is deployed.
  SEED_PREVIEW_APPS: z.string().optional(),
  // Where Meta redirects back after the merchant approves access —
  // must exactly match one of the "Valid OAuth Redirect URIs" configured
  // on the Meta app. Points at the admin app, not the API, since that's
  // where the Connect UI lives; the API only ever receives the resulting
  // `code` as a query param forwarded from there.
  // Where Facebook sends sellers back (the admin's callback page). Unset:
  // <ADMIN_ORIGIN>/admin/apps/meta/callback. Must be listed in the Meta
  // app's Valid OAuth Redirect URIs exactly as set here.
  META_OAUTH_REDIRECT_URI: z.string().optional(),
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

// Store addresses are {handle}.<root domain> — never a hosting provider's
// domain (Railway, Vercel…), which must stay invisible to shoppers. If the
// root domain isn't set (or is one of those), it's taken from the admin's
// own address: store.oyklane.com → oyklane.com.
const INFRA_DOMAINS = ["railway.app", "vercel.app", "onrender.com", "herokuapp.com", "netlify.app", "fly.dev", "pages.dev", "azurewebsites.net"];
const isInfraDomain = (host) => INFRA_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
{
  const d = parsed.data;
  if (isInfraDomain(d.STOREFRONT_ROOT_DOMAIN)) {
    console.error(`STOREFRONT_ROOT_DOMAIN=${d.STOREFRONT_ROOT_DOMAIN} is a hosting provider's domain — set it to your own (e.g. oyklane.com).`);
    d.STOREFRONT_ROOT_DOMAIN = "localhost";
  }
  if (d.NODE_ENV === "production" && d.STOREFRONT_ROOT_DOMAIN === "localhost") {
    try {
      const host = new URL(d.ADMIN_ORIGIN).hostname.toLowerCase();
      const parts = host.split(".");
      if (parts.length >= 3 && !isInfraDomain(host)) {
        d.STOREFRONT_ROOT_DOMAIN = parts.slice(1).join(".");
        console.warn(`STOREFRONT_ROOT_DOMAIN not set — using ${d.STOREFRONT_ROOT_DOMAIN} (from ADMIN_ORIGIN). Set it explicitly.`);
      } else {
        console.error("STOREFRONT_ROOT_DOMAIN is not set — store addresses can't be built. Set it to your domain, e.g. oyklane.com.");
      }
    } catch {
      /* stays unset */
    }
  }
}

// The API's public address is baked into uploaded-image links. In
// production it must be a real https address — never the localhost
// default (the variable was simply not set) and never plain http, which
// browsers block inside https pages.
{
  const d = parsed.data;
  if (d.NODE_ENV === "production") {
    if (/\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(d.API_PUBLIC_URL) && d.STOREFRONT_ROOT_DOMAIN !== "localhost") {
      d.API_PUBLIC_URL = `https://api.${d.STOREFRONT_ROOT_DOMAIN}`;
      console.warn(`API_PUBLIC_URL not set — using ${d.API_PUBLIC_URL}. Set it explicitly.`);
    } else if (d.API_PUBLIC_URL.startsWith("http://")) {
      d.API_PUBLIC_URL = d.API_PUBLIC_URL.replace(/^http:\/\//, "https://");
    }
    d.API_PUBLIC_URL = d.API_PUBLIC_URL.replace(/\/+$/, "");
  }
}

// Free plans for everyone is not a mistake a production deploy gets to make.
if (parsed.data.BILLING_SANDBOX && parsed.data.NODE_ENV === "production") {
  console.error("BILLING_SANDBOX=true is not allowed when NODE_ENV=production. Remove it and set the Razorpay keys.");
  process.exit(1);
}

// Sessions are cookies set by the API and read by the admin's own server.
// With the API and the admin on different hosts (api. vs store.), the
// cookie must be scoped to the shared parent domain, or every sign-in
// bounces straight back to /login.
{
  const host = (url) => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  };
  const d = parsed.data;
  if (d.NODE_ENV === "production" && !d.COOKIE_DOMAIN && host(d.ADMIN_ORIGIN) !== host(d.API_PUBLIC_URL)) {
    console.warn(
      `COOKIE_DOMAIN is not set, but the admin (${d.ADMIN_ORIGIN}) and the API (${d.API_PUBLIC_URL}) are on different hosts — ` +
        "sign-ins won't stick. Set COOKIE_DOMAIN to the shared parent domain, e.g. .oyklane.com."
    );
  }
  // The browser apps allowed to call the API (CORS, app.js). A localhost
  // value copied from development blocks that app in production with a
  // bare "Failed to fetch".
  for (const key of ["ADMIN_ORIGIN", "SUPER_ADMIN_ORIGIN", "STOREFRONT_ORIGIN"]) {
    if (d.NODE_ENV === "production" && ["localhost", "127.0.0.1"].includes(host(d[key]))) {
      console.warn(`${key} is ${d[key]} — the real ${key.replace(/_ORIGIN$/, "").toLowerCase().replace(/_/g, " ")} app can't call this API until it's set to its https:// address.`);
    }
  }
  // One-time codes (Phone Login, One-Click Checkout) need a working SMS or
  // WhatsApp provider; a half-set one is silently treated as "none".
  if (d.NODE_ENV === "production") {
    const zohoKey = d.ZEPTOMAIL_TOKEN || d.ZOHO_CPAAS_TOKEN;
    if (d.WHATSAPP_PROVIDER === "zoho" && !(zohoKey && d.ZOHO_WHATSAPP_FROM)) {
      console.warn("WHATSAPP_PROVIDER is zoho but ZOHO_CPAAS_TOKEN or ZOHO_WHATSAPP_FROM is missing — WhatsApp codes are off.");
    }
    // The code template itself is set in Super admin ▸ Messaging (or ZOHO_WHATSAPP_TEMPLATE_KEY).
    const anySms = d.SMS_PROVIDER || d.MSG91_AUTH_KEY || d.TWILIO_ACCOUNT_SID;
    const anyWhatsapp = d.WHATSAPP_PROVIDER || d.ZOHO_WHATSAPP_TEMPLATE_KEY || d.META_WHATSAPP_TOKEN || d.TWILIO_WHATSAPP_FROM;
    if (!anySms && !anyWhatsapp) console.warn("No SMS or WhatsApp provider set — Phone Login and One-Click Checkout can't send codes.");
  }
}

// Facebook's sign-in comes back to the admin unless set otherwise.
if (!parsed.data.META_OAUTH_REDIRECT_URI) {
  parsed.data.META_OAUTH_REDIRECT_URI = `${String(parsed.data.ADMIN_ORIGIN).replace(/\/$/, "")}/admin/apps/meta/callback`;
}

module.exports = { env: parsed.data, isInfraDomain };
