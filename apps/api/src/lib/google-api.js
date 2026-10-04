const { HttpError } = require("@shopcycle/utils");
const { env } = require("../config/env");
const { encryptSecret, decryptSecret } = require("./crypto");

/**
 * Calls to Google APIs on a seller's behalf (Google Business Profile for
 * reviews, Merchant Center for the shopping channel). The seller signs in
 * with Google once for the whole store (accounts/google.js) — Oyklane's
 * own OAuth client, every Google app's access asked for together; the
 * refresh token Google gives back (stored encrypted) gets a fresh access
 * token whenever one is needed — the connection lasts until the seller
 * removes it in their Google account.
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

/** Google's sign-in asking for `scopes` (plus who the account is). */
function authorizeUrl(scopes, state) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: ["openid", "email", "profile", ...scopes].join(" "),
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

/** Who signed in, from the id_token Google's token endpoint returned
 * (straight from Google over TLS, so its claims are taken as they are). */
function idClaims(idToken) {
  try {
    return JSON.parse(Buffer.from(String(idToken).split(".")[1], "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/** The code from the redirect → stored credentials (tokens encrypted), the
 * scopes granted, and the Google account's email/name. */
async function exchangeCode(code) {
  const json = await token({ code: String(code), redirect_uri: redirectUri(), grant_type: "authorization_code" });
  if (!json.refresh_token) throw new HttpError(400, "Google didn't send a lasting connection. Remove Oyklane under myaccount.google.com ▸ Security ▸ Third-party access, then connect again.");
  const claims = idClaims(json.id_token);
  return {
    credentials: {
      via: "google",
      refreshToken: encryptSecret(json.refresh_token),
      accessToken: encryptSecret(json.access_token),
      accessExpiresAt: new Date(Date.now() + (Number(json.expires_in) || 3600) * 1000 - 60 * 1000).toISOString(),
    },
    scopes: String(json.scope || "").split(/\s+/).filter(Boolean),
    profile: { email: claims.email ? String(claims.email) : null, name: claims.name ? String(claims.name) : null, picture: /^https:\/\//.test(claims.picture || "") ? claims.picture : null },
  };
}

/** Gives up the connection at Google too (best effort). */
async function revoke(credentials) {
  try {
    await fetch(url("oauth2.googleapis.com", `/revoke?${new URLSearchParams({ token: decryptSecret(credentials.refreshToken) })}`), { method: "POST", signal: AbortSignal.timeout(8000) });
  } catch {
    // Already gone, or Google unreachable — removing it here is what matters.
  }
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

// Errors that are about Oyklane's own Google project (an API not switched
// on, Merchant API not registered yet) — nothing the seller can fix.
function isPlatformSetup(status, error) {
  const msg = String(error?.message || "");
  const reasons = JSON.stringify(error?.details || []);
  return (
    /not registered with the merchant account/i.test(msg) ||
    /SERVICE_DISABLED|API_KEY_SERVICE_BLOCKED|accessNotConfigured/i.test(reasons) ||
    /has not been used in project|is disabled|are blocked/i.test(msg)
  );
}

function explain(status, error) {
  const msg = String(error?.message || "");
  if (isPlatformSetup(status, error)) {
    return "Google hasn't switched this on for Oyklane yet — a one-time setup on Oyklane's side, nothing for you to do. Meanwhile use the other way shown on this page.";
  }
  if (status === 401) return "Google says the sign-in has expired or was removed. Sign in with Google again.";
  if (status === 403 && /insufficient.*scope/i.test(msg)) return "Your Google sign-in didn't allow this. Sign in with Google again and tick every box.";
  return msg || `Google answered ${status}`;
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
    const err = new HttpError(res.status === 404 ? 404 : 400, explain(res.status, json?.error));
    err.google = json?.error || null;
    err.googleStatus = res.status;
    err.platformSetup = isPlatformSetup(res.status, json?.error);
    throw err;
  }
  return json;
}

module.exports = { SCOPES, configured, redirectUri, url, authorizeUrl, exchangeCode, revoke, accessToken, call };
