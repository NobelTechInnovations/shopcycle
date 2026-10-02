const { HttpError } = require("@shopcycle/utils");
const { env } = require("../config/env");
const { encryptSecret, decryptSecret } = require("./crypto");

/**
 * Calls to Google APIs on a seller's behalf (Google Business Profile for
 * reviews, Merchant Center for the shopping channel). The seller signs in
 * with Google once; the refresh token Google gives back (stored encrypted)
 * gets a fresh access token whenever one is needed — the connection lasts
 * until the seller removes it in their Google account.
 *
 * Uses the same OAuth client as "Continue with Google" (GOOGLE_CLIENT_ID /
 * SECRET); its redirect URI list needs <ADMIN_ORIGIN>/admin/apps/google/callback.
 */

const SCOPES = {
  reviews: "https://www.googleapis.com/auth/business.manage",
  merchant: "https://www.googleapis.com/auth/content",
};

const configured = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const redirectUri = () => `${env.ADMIN_ORIGIN.replace(/\/$/, "")}/admin/apps/google/callback`;

/** https://<host><path>, or the test mock's address for it. */
function url(host, path) {
  return env.GOOGLE_API_BASE ? `${env.GOOGLE_API_BASE.replace(/\/$/, "")}/${host}${path}` : `https://${host}${path}`;
}

function authorizeUrl(purpose, state) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: `openid email ${SCOPES[purpose]}`,
    access_type: "offline",
    // Always ask, so Google sends a refresh token even on a second connect.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${env.GOOGLE_OAUTH_URL}?${params}`;
}

async function token(body) {
  let res;
  try {
    res = await fetch(env.GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...body }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(502, "Couldn't reach Google. Try again in a minute.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    if (json.error === "invalid_grant") throw new HttpError(400, "Google says the connection was removed or expired. Connect again.");
    throw new HttpError(400, json.error_description || json.error || "Google sign-in didn't complete. Try again.");
  }
  return json;
}

/** The code from the redirect → stored credentials (refresh token encrypted). */
async function exchangeCode(code, purpose) {
  const json = await token({ code: String(code), redirect_uri: redirectUri(), grant_type: "authorization_code" });
  const granted = String(json.scope || "").split(/\s+/);
  if (SCOPES[purpose] && !granted.includes(SCOPES[purpose])) {
    throw new HttpError(400, "Google didn't give access to everything needed — connect again and tick every box on Google's screen.");
  }
  if (!json.refresh_token) throw new HttpError(400, "Google didn't send a lasting connection. Remove Oyklane under myaccount.google.com ▸ Security ▸ Third-party access, then connect again.");
  return {
    via: "google",
    refreshToken: encryptSecret(json.refresh_token),
    accessToken: encryptSecret(json.access_token),
    accessExpiresAt: new Date(Date.now() + (Number(json.expires_in) || 3600) * 1000 - 60 * 1000).toISOString(),
  };
}

/** A working access token for stored credentials; `fresh` is set when the
 * credentials changed (a new access token) and should be saved. */
async function accessToken(credentials) {
  if (credentials.accessToken && credentials.accessExpiresAt && new Date(credentials.accessExpiresAt) > new Date()) {
    return { token: decryptSecret(credentials.accessToken), fresh: null };
  }
  const json = await token({ refresh_token: decryptSecret(credentials.refreshToken), grant_type: "refresh_token" });
  const fresh = {
    ...credentials,
    accessToken: encryptSecret(json.access_token),
    accessExpiresAt: new Date(Date.now() + (Number(json.expires_in) || 3600) * 1000 - 60 * 1000).toISOString(),
  };
  return { token: json.access_token, fresh };
}

/** One Google API call. Errors become messages a seller can act on. */
async function call(accessTokenValue, method, target, body) {
  let res;
  try {
    res = await fetch(target, {
      method,
      headers: { authorization: `Bearer ${accessTokenValue}`, accept: "application/json", ...(body && { "content-type": "application/json" }) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new HttpError(502, "Couldn't reach Google. Try again in a minute.");
  }
  if (res.status === 204) return {};
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `Google answered ${res.status}`;
    const err = new HttpError(res.status === 401 ? 400 : res.status === 404 ? 404 : 400, res.status === 401 ? "Google says the connection has expired. Connect again." : msg);
    err.google = json?.error || null;
    err.googleStatus = res.status;
    throw err;
  }
  return json;
}

module.exports = { SCOPES, configured, redirectUri, url, authorizeUrl, exchangeCode, accessToken, call };
