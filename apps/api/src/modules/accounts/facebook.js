const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const meta = require("../meta/service");
const repository = require("../meta/repository");

/**
 * The store's Facebook account — one Facebook login (Oyklane's own Meta
 * app; the seller never handles a token) that every Meta app uses:
 * Instagram Feed, Facebook & Instagram shop, Facebook Pixel, Meta Ads and
 * WhatsApp. All their permissions are asked for in that one login, so
 * installing another Meta app later just shows "pick your page / catalog
 * / pixel". Kept in meta_connections (one row per store).
 *
 * META_LOGIN_SCOPES (comma-separated) narrows what's asked for, e.g. to
 * the permissions Meta has approved for the app so far.
 */

const DEFAULT_SCOPES = [
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "catalog_management",
  "ads_read",
  // Meta Ads app: creates campaigns, ad sets and ads (meta-ads/service.js).
  "ads_management",
  "whatsapp_business_management",
  "whatsapp_business_messaging",
];
// What each app needs from the login.
const ACCESS = {
  instagram: ["instagram_basic", "pages_show_list"],
  catalog: ["catalog_management", "business_management"],
  pixel: ["ads_read"],
  ads: ["ads_management"],
  whatsapp: ["whatsapp_business_management"],
};
const LABEL = { instagram: "your Instagram account", catalog: "your catalogues", pixel: "your pixels", ads: "your ad accounts", whatsapp: "WhatsApp" };

function scopes() {
  const custom = String(env.META_LOGIN_SCOPES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return custom.length ? custom : DEFAULT_SCOPES;
}

/** Facebook's login for this store; `rerequest` asks again for anything
 * the seller unticked last time. With META_LOGIN_CONFIG_ID (a Business
 * app's Facebook Login for Business configuration) the configuration
 * decides the permissions; otherwise they're asked for by name. */
function authorizeUrl({ rerequest = false } = {}) {
  if (!meta.metaConfigured()) throw new HttpError(400, "Facebook sign-in isn't set up on Oyklane yet.");
  const url = new URL(meta.buildAuthorizeUrl(scopes()));
  if (env.META_LOGIN_CONFIG_ID) {
    url.searchParams.delete("scope");
    url.searchParams.set("config_id", env.META_LOGIN_CONFIG_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("override_default_response_type", "true");
  }
  if (rerequest) url.searchParams.set("auth_type", "rerequest");
  return url.toString();
}

/** Permissions the login actually has (the seller can untick some). */
async function granted(token) {
  const json = await meta.graphRequest("/me/permissions", { token });
  return (json.data || []).filter((p) => p.status === "granted").map((p) => String(p.permission));
}

const expired = (row) => Boolean(row?.tokenExpiresAt && new Date(row.tokenExpiresAt) < new Date());

async function status(prisma, storeId) {
  const row = await repository.findByStore(prisma, storeId);
  const base = { configured: meta.metaConfigured() };
  if (!row) return { ...base, connected: false };
  let perms = null;
  let error = null;
  if (expired(row)) error = "Your Facebook login has expired. Continue with Facebook again.";
  else {
    try {
      perms = await granted(row.accessToken);
    } catch (err) {
      error = /expired|session|validating access token/i.test(err.message || "")
        ? "Facebook says this login has expired or was removed. Continue with Facebook again."
        : null; // Facebook unreachable — don't call the login broken
    }
  }
  return {
    ...base,
    connected: !error,
    name: row.facebookUserName || null,
    expiresAt: row.tokenExpiresAt || null,
    error,
    // Unknown (Facebook didn't answer) counts as having it; the app's own
    // call reports a real gap.
    access: Object.fromEntries(Object.entries(ACCESS).map(([k, need]) => [k, !perms || need.every((p) => perms.includes(p))])),
  };
}

/** The code Facebook sent back → the store's Facebook account. A different
 * Facebook person than before clears the old page/ad account picks. */
async function connect(prisma, storeId, code) {
  const { accessToken, expiresAt } = await meta.exchangeCodeForLongLivedToken(code);
  const profile = await meta.fetchProfile(accessToken);
  const existing = await repository.findByStore(prisma, storeId);
  const otherPerson = existing && existing.facebookUserId && existing.facebookUserId !== String(profile.id);
  await repository.upsert(prisma, storeId, {
    accessToken,
    tokenExpiresAt: expiresAt,
    facebookUserId: String(profile.id),
    facebookUserName: profile.name || null,
    ...(otherPerson && { adAccountId: null, adAccountName: null, pageId: null, pageName: null, wabaId: null, wabaName: null, phoneNumberId: null, phoneNumberLabel: null }),
  });
  return status(prisma, storeId);
}

/** Thrown when an app needs the Facebook account (or more of it): the
 * admin shows "Continue with Facebook" for `details.needs`. */
function needsFacebook(access, message) {
  return new HttpError(409, message, { needs: "facebook", access });
}

/** The store's Facebook login token, for an app that needs `access`. */
async function token(prisma, storeId, access) {
  const row = await repository.findByStore(prisma, storeId);
  if (!row) throw needsFacebook(access, "Continue with Facebook first.");
  if (expired(row)) throw needsFacebook(access, "Your Facebook login has expired. Continue with Facebook again.");
  return row.accessToken;
}

/** A Graph error from an app's call, as something the seller can act on. */
function explain(err, access) {
  const msg = String(err?.message || "");
  if (/expired|session has been invalidated|validating access token/i.test(msg)) return needsFacebook(access, "Facebook says this login has expired. Continue with Facebook again.");
  if (/permission|not authorized|\(#10\)|\(#200\)/i.test(msg)) return needsFacebook(access, `Facebook didn't give access to ${LABEL[access] || "that"}. Continue with Facebook again and allow it.`);
  return err;
}

async function disconnect(prisma, storeId) {
  await repository.remove(prisma, storeId);
}

module.exports = { ACCESS, scopes, authorizeUrl, status, connect, token, explain, needsFacebook, disconnect };
