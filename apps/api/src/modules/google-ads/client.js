const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const google = require("../../lib/google-api");
const googleAccount = require("../accounts/google");

/**
 * The Google Ads API (REST) for one store, through its Google sign-in (with
 * the Google Ads permission). Every call names the customer (ad account);
 * `loginCustomerId` is the manager account it's reached through, when it is.
 *
 * No developer token: Google retired them on 9 Sep 2026. API access (Test,
 * Explorer, Basic, Standard) now belongs to the Google Cloud project of
 * Oyklane's OAuth client — Google Cloud ▸ Google Ads API ▸ Overview.
 */

const BASE = () => google.url("googleads.googleapis.com", `/${env.GOOGLE_ADS_API_VERSION}`);
const digits = (id) => String(id || "").replace(/\D/g, "");

function configured() {
  return google.configured();
}

/** Google's error codes → what the seller can do about it. */
const PLAIN = {
  // Oyklane's Google Cloud project is still at "Test" access (Google Ads API ▸ Overview).
  CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION: "Oyklane's Google Ads access is still waiting for Google's approval, so only Google's test accounts work for now. Real accounts work as soon as it's approved — nothing for you to do.",
  ACTION_NOT_PERMITTED: "Oyklane's Google Ads access doesn't allow this yet — Google is still approving it. Try again in a few days.",
  DEVELOPER_TOKEN_NOT_APPROVED: "Oyklane's Google Ads access is still waiting for Google's approval, so only Google's test accounts work for now. Real accounts work as soon as it's approved — nothing for you to do.",
  DEVELOPER_TOKEN_PROHIBITED: "Google hasn't allowed Oyklane's Google Ads access for this account.",
  USER_PERMISSION_DENIED: "Your Google login can't manage this Google Ads account — ask its owner to give your email Admin or Standard access (Google Ads ▸ Admin ▸ Access and security).",
  CUSTOMER_NOT_ENABLED: "This Google Ads account isn't active yet — finish setting it up (billing) in Google Ads first.",
  NOT_ADS_USER: "This Google login has no Google Ads account. Create one at ads.google.com, then come back.",
  OAUTH_TOKEN_EXPIRED: "Your Google sign-in expired. Sign in with Google again.",
  INSUFFICIENT_BUDGET: "The budget is too low for this campaign type.",
  NON_MULTIPLE_OF_MINIMUM_CURRENCY_UNIT: "Amounts must be in whole paise (two decimals at most).",
  DUPLICATE_CAMPAIGN_NAME: "You already have a campaign with this name — choose another.",
  DUPLICATE_NAME: "Something with this name already exists — choose another name.",
  TOO_SHORT: "A text is too short.",
  TOO_LONG: "A text is too long for Google.",
  POLICY_FINDING: "Google's ad policies flagged this text.",
  INVALID_URL: "A link isn't valid — use a full https:// address on your store.",
  MISSING_SHOPPING_SETTING: "Shopping and Performance Max for products need your Merchant Center linked.",
  MERCHANT_NOT_LINKED: "Link your Merchant Center to this Google Ads account first (Merchant Center ▸ Settings ▸ Linked accounts ▸ Google Ads).",
  ASPECT_RATIO_NOT_ALLOWED: "An image has the wrong shape for where it's used.",
  NOT_ENOUGH_HEADLINE_ASSET: "Add more headlines.",
  NOT_ENOUGH_DESCRIPTION_ASSET: "Add more descriptions.",
  NOT_ENOUGH_MARKETING_IMAGE_ASSET: "Add a landscape image.",
  NOT_ENOUGH_SQUARE_MARKETING_IMAGE_ASSET: "Add a square image.",
  NOT_ENOUGH_LOGO_ASSET: "Add a logo.",
  BIDDING_STRATEGY_TYPE_INCOMPATIBLE_WITH_CHANNEL_TYPE: "That bidding choice doesn't work with this campaign type.",
};

/** The first readable failure in a GoogleAdsFailure. */
function explainFailure(json) {
  const errs = json?.error?.details?.flatMap((d) => d.errors || []) || [];
  const first = errs[0];
  if (!first) return { message: json?.error?.message || "Google Ads didn't accept the request.", errors: [] };
  const code = Object.values(first.errorCode || {})[0];
  const list = errs.slice(0, 10).map((e) => {
    const c = Object.values(e.errorCode || {})[0];
    const where = (e.location?.fieldPathElements || []).map((f) => `${f.fieldName}${f.index != null ? `[${f.index}]` : ""}`).join(".");
    return { code: c, message: PLAIN[c] || e.message, field: where || null, trigger: e.trigger?.stringValue || null, operation: e.location?.fieldPathElements?.find((f) => f.fieldName === "mutate_operations")?.index ?? null };
  });
  return { message: PLAIN[code] || first.message || "Google Ads didn't accept the request.", code, errors: list };
}

/** One Google Ads API request for the store's customer. */
async function request(prisma, storeId, path, { method = "GET", body, loginCustomerId } = {}) {
  if (!configured()) throw new HttpError(400, "Google Ads isn't set up on Oyklane yet.", { reason: "platform_setup" });
  const token = await googleAccount.accessToken(prisma, storeId, "ads");
  const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
  if (loginCustomerId) headers["login-customer-id"] = digits(loginCustomerId);
  if (body) headers["content-type"] = "application/json";
  let res;
  try {
    res = await fetch(`${BASE()}/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45000) });
  } catch {
    throw new HttpError(502, "Couldn't reach Google Ads. Try again in a minute.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw googleAccount.needsGoogle("ads", "Google says this sign-in has expired. Sign in with Google again.");
    const f = explainFailure(json);
    throw new HttpError(res.status === 404 ? 404 : res.status === 403 ? 403 : 400, f.message, { reason: f.code || "google_ads_error", errors: f.errors });
  }
  return json;
}

/** GAQL search, every page (up to `max` rows). */
async function search(prisma, storeId, acct, query, { max = 2000 } = {}) {
  const rows = [];
  let pageToken;
  do {
    const r = await request(prisma, storeId, `customers/${digits(acct.customerId)}/googleAds:search`, { method: "POST", body: { query, ...(pageToken ? { pageToken } : {}) }, loginCustomerId: acct.loginCustomerId });
    rows.push(...(r.results || []));
    pageToken = r.nextPageToken;
  } while (pageToken && rows.length < max);
  return rows;
}

/** Atomic mutate across resources (all or nothing). */
async function mutate(prisma, storeId, acct, mutateOperations, { validateOnly = false } = {}) {
  return request(prisma, storeId, `customers/${digits(acct.customerId)}/googleAds:mutate`, { method: "POST", body: { mutateOperations, validateOnly, partialFailure: false }, loginCustomerId: acct.loginCustomerId });
}

const micros = (rupees) => String(Math.round(Number(rupees) * 1e6));
const fromMicros = (m) => (m == null ? null : Number(m) / 1e6);

module.exports = { configured, request, search, mutate, explainFailure, micros, fromMicros, digits, PLAIN };
