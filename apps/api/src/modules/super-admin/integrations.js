const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const google = require("../../lib/google-api");
const googleAccount = require("../accounts/google");
const facebookAccount = require("../accounts/facebook");

/**
 * /api/super-admin/integrations — Oyklane's own Google and Meta setup in
 * one place: which keys are on the server, the redirect URIs to register
 * with Google and Meta, a live test of the Places key, and the one-time
 * Merchant API registration that lets every store's Google & YouTube app
 * reach Merchant Center. Inherits the super-admin auth hooks and the audit
 * log from routes.js.
 */

const SETTING = "google-merchant-registration";

const registerSchema = z.object({
  storeId: z.string().min(5).max(40),
  merchantId: z.string().trim().regex(/^\d{5,20}$/, "The Merchant Center ID is a number (top right of merchants.google.com)."),
  developerEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
});

async function integrationsRoutes(fastify) {
  const { prisma } = fastify;

  fastify.get("/", async () => {
    const admin = env.ADMIN_ORIGIN.replace(/\/$/, "");
    const registration = await prisma.platformSetting.findUnique({ where: { key: SETTING } });
    // Stores whose Google account can do the registration (the owner's own).
    const rows = await prisma.appConnection.findMany({
      where: { appKey: googleAccount.KEY },
      select: { storeId: true, profile: true, credentials: true, store: { select: { name: true, handle: true } } },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return {
      google: {
        configured: google.configured(),
        redirectUri: google.redirectUri(),
        scopes: Object.values(googleAccount.ACCESS),
      },
      places: { configured: Boolean(env.GOOGLE_PLACES_API_KEY) },
      meta: {
        configured: Boolean(env.META_APP_ID && env.META_APP_SECRET),
        redirectUri: env.META_OAUTH_REDIRECT_URI,
        expectedRedirectUri: `${admin}/admin/apps/meta/callback`,
        scopes: facebookAccount.scopes(),
        configId: env.META_LOGIN_CONFIG_ID || null,
      },
      instagram: { configured: Boolean(env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET), redirectUri: `${admin}/admin/apps/instagram` },
      merchant: registration?.value || null,
      googleStores: rows
        .filter((r) => (r.credentials?.scopes || []).includes(googleAccount.ACCESS.merchant))
        .map((r) => ({ storeId: r.storeId, store: r.store.name, handle: r.store.handle, email: r.profile?.email || null })),
    };
  });

  /** A real search with the Places key — shows Google's own answer. */
  fastify.post("/places/test", async () => {
    if (!env.GOOGLE_PLACES_API_KEY) return { ok: false, error: "GOOGLE_PLACES_API_KEY isn't set on the API." };
    try {
      const res = await fetch(`${env.GOOGLE_PLACES_URL.replace(/\/$/, "")}/places:searchText`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.GOOGLE_PLACES_API_KEY, "x-goog-fieldmask": "places.id,places.displayName,places.userRatingCount,places.reviews" },
        body: JSON.stringify({ textQuery: "India Gate New Delhi", languageCode: "en" }),
        signal: AbortSignal.timeout(15000),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json?.error?.message || `Google answered ${res.status}` };
      const top = (json.places || [])[0];
      // Ratings without review texts: the Google Cloud project has no
      // billing account, and Google leaves the (paid) reviews field out.
      const reviews = (top?.reviews || []).length;
      return { ok: true, found: (json.places || []).length, reviews, reviewsMissing: Boolean(top?.userRatingCount) && reviews === 0 };
    } catch {
      return { ok: false, error: "Couldn't reach Google." };
    }
  });

  /**
   * Merchant API's one-time developer registration: links Oyklane's Google
   * Cloud project to Oyklane's own Merchant Center account, using the
   * Google sign-in of a store that has that account. Until this is done,
   * Merchant API refuses every call ("GCP project … is not registered").
   */
  fastify.post("/google-merchant/register", async (request) => {
    const body = registerSchema.parse(request.body || {});
    const token = await googleAccount.accessToken(prisma, body.storeId, "merchant");
    try {
      await google.call(token, "POST", google.url("merchantapi.googleapis.com", `/accounts/v1/accounts/${body.merchantId}/developerRegistration:registerGcp`), {
        ...(body.developerEmail && { developerEmail: body.developerEmail }),
      });
    } catch (err) {
      // Show Google's own words to the operator.
      throw new HttpError(400, err.google?.message || err.message);
    }
    const value = { merchantId: body.merchantId, storeId: body.storeId, at: new Date().toISOString(), by: request.currentUser?.email || null };
    await prisma.platformSetting.upsert({ where: { key: SETTING }, update: { value }, create: { key: SETTING, value } });
    return { merchant: value };
  });
}

module.exports = integrationsRoutes;
