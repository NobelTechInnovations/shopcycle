const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../config/env");

/**
 * "Continue with Google" (OpenID Connect, authorization-code flow) for
 * sellers and shoppers. The state is a signed JWT carrying a nonce that
 * must match an HttpOnly cookie set on this browser at the start, so a
 * sign-in can't be started in one browser and finished in another (login
 * CSRF). The ID token comes straight from Google's token endpoint over TLS
 * with our client secret, so its claims are trusted after the checks in
 * `exchange()`.
 */
const NONCE_COOKIE = "oy_g_nonce";
const STATE_TTL = "10m";

function configured() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function callbackUrl(path) {
  return `${env.API_PUBLIC_URL.replace(/\/$/, "")}${path}`;
}

/** Starts a sign-in: sets the nonce cookie, returns Google's URL. */
function start(fastify, reply, { callbackPath, cookiePath, audience, data = {} }) {
  const nonce = crypto.randomBytes(18).toString("base64url");
  reply.setCookie(NONCE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: env.NODE_ENV === "production", path: cookiePath, maxAge: 600 });
  const state = fastify.jwt.sign({ aud: audience, n: nonce, ...data }, { expiresIn: STATE_TTL });
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(callbackPath),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
  });
  return `${env.GOOGLE_OAUTH_URL}?${params}`;
}

/** Checks the state against this browser's nonce cookie; returns its data. */
function readState(fastify, request, reply, { audience, cookiePath }) {
  const nonce = request.cookies?.[NONCE_COOKIE];
  reply.clearCookie(NONCE_COOKIE, { path: cookiePath });
  let state = null;
  try {
    state = fastify.jwt.verify(String(request.query.state || ""));
  } catch {}
  if (!state || state.aud !== audience || !nonce || state.n !== nonce) {
    throw new HttpError(400, "That Google sign-in expired or was started in another browser. Please try again.");
  }
  return state;
}

function decodeJwtPayload(token) {
  const part = String(token || "").split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** Swaps the code for the user's verified Google identity. */
async function exchange({ code, callbackPath, nonce }) {
  if (!code) throw new HttpError(400, "Google sign-in was cancelled.");
  const res = await fetch(env.GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      code: String(code),
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl(callbackPath),
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => null);
  const claims = res.ok ? decodeJwtPayload(data?.id_token) : null;
  const now = Math.floor(Date.now() / 1000);
  if (
    !claims ||
    claims.aud !== env.GOOGLE_CLIENT_ID ||
    !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) ||
    !(claims.exp > now) ||
    claims.nonce !== nonce ||
    !claims.sub
  ) {
    throw new HttpError(400, "Google sign-in didn't complete. Please try again.");
  }
  if (!claims.email || claims.email_verified !== true) {
    throw new HttpError(400, "Your Google account's email isn't verified, so it can't be used to sign in.");
  }
  return { sub: String(claims.sub), email: String(claims.email).toLowerCase(), name: String(claims.name || claims.given_name || "").trim() };
}

module.exports = { configured, start, readState, exchange, NONCE_COOKIE };
