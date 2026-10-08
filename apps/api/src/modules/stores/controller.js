const { storefrontBaseUrl, oyklaneAddress } = require("../../lib/storefront-url");
const { storeSettings, mergeSettings } = require("../../lib/store-settings");
const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");

const updateStoreSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  currency: z.string().min(3).max(3).optional(),
  timezone: z.string().optional(),
  // A bare host, e.g. "shop.example.com" — no scheme/path. Empty string
  // clears it (Prisma's @unique on a nullable column tolerates any number
  // of nulls, but not two rows sharing "" — so an empty string is coerced
  // to null here rather than passed straight through).
  domain: z
    .string()
    .regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i, "Enter a valid domain")
    .optional()
    .or(z.literal(""))
    .nullable(),
  // Shown to shoppers (order emails' Reply-To, order status page, invoices).
  supportEmail: z.string().trim().email("Enter a valid email").max(200).optional().nullable().or(z.literal("")),
  supportPhone: z.string().trim().max(20).optional().nullable().or(z.literal("")),
  // Partial update of Store.settings — merged, never replaced (lib/store-settings.js).
  settings: z
    .object({
      notifications: z
        .object({ newOrderAlert: z.boolean().optional(), abandonedCheckout: z.boolean().optional() })
        .optional(),
      returnWindowDays: z.coerce.number().int().min(0).max(90).optional(),
      invoicePrefix: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9]{1,5}$/, "Use 1 to 5 letters or numbers")
        .optional(),
      lowStockThreshold: z.coerce.number().int().min(0).max(100000).optional(),
      // Online Store ▸ Preferences — the home page's search and social listing.
      seo: z
        .object({
          title: z.string().trim().max(120).optional(),
          description: z.string().trim().max(320).optional(),
          image: z
            .string()
            .trim()
            .max(1000)
            .refine((v) => !v || /^(https?:\/\/|\/)/.test(v), "Upload an image")
            .optional(),
          favicon: z
            .string()
            .trim()
            .max(1000)
            .refine((v) => !v || /^(https?:\/\/|\/)/.test(v), "Upload an image")
            .optional(),
        })
        .optional(),
      // Settings ▸ Checkout — see lib/store-settings.js.
      checkout: z
        .object({
          phone: z.enum(["required", "optional", "hidden"]).optional(),
          address2: z.enum(["required", "optional", "hidden"]).optional(),
          company: z.enum(["required", "optional", "hidden"]).optional(),
          gstin: z.enum(["optional", "hidden"]).optional(),
          note: z.enum(["optional", "hidden"]).optional(),
          marketing: z.enum(["unchecked", "hidden"]).optional(),
          country: z.enum(["show", "india"]).optional(),
        })
        .optional(),
    })
    .optional(),
});

/** Store-level settings (domain, name) are for owners and admins. */
function assertCanManageBilling(request) {
  if (request.storeRole === "staff") {
    throw new HttpError(403, "Only the store owner or an admin can change these settings.");
  }
}

async function getStoreHandler(request, reply) {
  // resolvedSettings: Store.settings with every default filled in.
  // The admin never builds store addresses itself — these are the only ones
  // it shows (lib/storefront-url.js).
  const store = { ...request.store, subscription: undefined, publicUrl: storefrontBaseUrl(request.store), oyklaneUrl: oyklaneAddress(request.store) };
  // The email server's password never leaves the API (store-email/service.js).
  if (store.settings?.smtp) store.settings = { ...store.settings, smtp: { ...store.settings.smtp, password: undefined } };
  const resolved = storeSettings(request.store);
  if (resolved.smtp) resolved.smtp = { ...resolved.smtp, password: undefined };
  reply.send({ store, role: request.storeRole, resolvedSettings: resolved, access: request.access, billingStatus: request.subscription?.status || null });
}

async function updateStoreHandler(request, reply) {
  assertCanManageBilling(request);
  const body = updateStoreSchema.parse(request.body);
  if ("domain" in body) {
    body.domain = body.domain || null;
    // Every store already has {handle}.<root domain> for free (see
    // apps/storefront/lib/domain.js) — that namespace is reserved for the
    // platform's own subdomain routing, so a merchant "connecting" one of
    // those addresses here would just be pointing the field at itself,
    // and worse, an arbitrary *.{root domain} value would collide with
    // whatever real handle it happens to spell.
    const root = env.STOREFRONT_ROOT_DOMAIN.toLowerCase();
    if (body.domain && (body.domain.toLowerCase() === root || body.domain.toLowerCase().endsWith(`.${root}`))) {
      throw new HttpError(
        400,
        `Every store already gets its own ${request.store.handle}.${root} address for free — enter a domain you own instead.`
      );
    }
  }

  for (const key of ["supportEmail", "supportPhone"]) {
    if (key in body) body[key] = body[key] || null;
  }
  if (body.settings) body.settings = mergeSettings(request.store, body.settings);

  try {
    const store = await request.server.prisma.store.update({
      where: { id: request.store.id },
      data: body,
    });
    reply.send({ store });
  } catch (err) {
    if (err.code === "P2002") throw new HttpError(409, "That domain is already in use by another store");
    throw err;
  }
}

module.exports = {
  getStoreHandler,
  updateStoreHandler,
};
