import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL } from "./api-url";
import { storefrontPath, isDomainRequest, ROOT_DOMAIN } from "./domain";

/**
 * Shopper sessions on the storefront. The session token (minted by the API
 * after a correct sign-in code) lives in an HttpOnly cookie the page's
 * scripts can't read, and is handed to the API server-to-server on each
 * request. On a store's own domain the cookie covers the whole site; on
 * the /store/:handle preview path it's limited to that store's path, so
 * two stores open on localhost never share a session.
 */
export const SHOPPER_COOKIE = "sc_customer";
export const LOGIN_EMAIL_COOKIE = "sc_login_email";
export const RETURN_COOKIE = "sc_login_return";
// The email typed into a sign-in/sign-up form that failed, to fill it back in.
export const PREFILL_COOKIE = "sc_login_prefill";
// Where a shopper may be sent back to after signing in.
export const RETURN_TARGETS = { checkout: "/checkout", cart: "/cart" };
// Phone sign-in (Phone Login app): the number and channel between steps,
// the "number verified" ticket while sign-up is finished, and the email
// being confirmed when that number joins an existing account.
export const LOGIN_PHONE_COOKIE = "sc_login_phone";
export const PHONE_CHANNEL_COOKIE = "sc_login_channel";
export const PHONE_TICKET_COOKIE = "sc_phone_ticket";
export const PHONE_PROFILE_COOKIE = "sc_phone_profile";
// "Continue with Google": a nonce only this browser holds, so the sign-in
// Google hands back is only accepted here.
export const GOOGLE_NONCE_COOKIE = "sc_google_nonce";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

// The Oyklane account (API: shopper/oyklane-id.js): one sign-in for every
// Oyklane store. Its cookie covers every <handle>.<root domain> store (and
// all of localhost in development); on a store's own domain it covers that
// store. "Miss" remembers "no account at this store yet" for a few hours,
// so the API isn't asked on every page.
export const OYKLANE_ID_COOKIE = "oy_id";
export const OYKLANE_MISS_COOKIE = "sc_oy_miss";
const ID_MAX_AGE = 60 * 60 * 24 * 90;
const MISS_MAX_AGE = 6 * 60 * 60;

function cookiePath(request, handle) {
  return isDomainRequest(request.headers.get("host")) ? "/" : `/store/${handle}`;
}

function isSecure(request) {
  const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  return proto === "https";
}

export function cookieOptions(request, handle, maxAge) {
  return { path: cookiePath(request, handle), httpOnly: true, sameSite: "lax", secure: isSecure(request), maxAge };
}

export async function shopperToken() {
  return (await cookies()).get(SHOPPER_COOKIE)?.value || null;
}

/** `idToken` (the Oyklane ID the API gave with the session) also signs
 * the shopper in to the other Oyklane stores. */
export function setShopperCookie(response, request, handle, token, idToken) {
  response.cookies.set(SHOPPER_COOKIE, token, cookieOptions(request, handle, SESSION_MAX_AGE));
  if (idToken) setOyklaneId(response, request, idToken);
  response.cookies.set(OYKLANE_MISS_COOKIE, "", cookieOptions(request, handle, 0));
}

function sharedDomain(request) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  return ROOT_DOMAIN !== "localhost" && host.endsWith(`.${ROOT_DOMAIN}`) ? ROOT_DOMAIN : undefined;
}

export function idCookieOptions(request, maxAge) {
  const domain = sharedDomain(request);
  return { path: "/", httpOnly: true, sameSite: "lax", secure: isSecure(request), maxAge, ...(domain && { domain }) };
}

export function setOyklaneId(response, request, idToken) {
  response.cookies.set(OYKLANE_ID_COOKIE, idToken, idCookieOptions(request, ID_MAX_AGE));
}

export function clearOyklaneId(response, request) {
  response.cookies.set(OYKLANE_ID_COOKIE, "", idCookieOptions(request, 0));
}

/** A click (or typed address) brought the shopper here — not a script.
 * Only then may their Oyklane account make a new account at this store. */
export function userNavigated(request) {
  return request.headers.get("sec-fetch-user") === "?1" && request.headers.get("sec-fetch-mode") === "navigate";
}

const idKey = (idToken) => createHash("sha256").update(idToken).digest("hex").slice(0, 16);

/**
 * Signs the shopper in to this store with their Oyklane account, when they
 * have one and no session here yet. `create`: may make an account here if
 * there isn't one. Returns null (nothing to do) or { token, created } /
 * { miss } / { clear } — hand it to applyOyklane with the response.
 */
export async function oyklaneSignIn(request, handle, { create = false } = {}) {
  const jar = await cookies();
  if (jar.get(SHOPPER_COOKIE)?.value) return null;
  const idToken = jar.get(OYKLANE_ID_COOKIE)?.value;
  if (!idToken) return null;
  if (!create && jar.get(OYKLANE_MISS_COOKIE)?.value === idKey(idToken)) return null;
  const res = await apiPost(handle, "/account/oyklane", { idToken, create });
  if (!res.ok || !res.data) return null;
  if (res.data.invalid) return { clear: true };
  if (res.data.none) return { miss: idKey(idToken) };
  return res.data.token ? { token: res.data.token, created: Boolean(res.data.created) } : null;
}

/** Sets the cookies an oyklaneSignIn result calls for. */
export function applyOyklane(response, request, handle, result) {
  if (!result) return response;
  if (result.token) {
    response.cookies.set(SHOPPER_COOKIE, result.token, cookieOptions(request, handle, SESSION_MAX_AGE));
    response.cookies.set(OYKLANE_MISS_COOKIE, "", cookieOptions(request, handle, 0));
  }
  if (result.miss) response.cookies.set(OYKLANE_MISS_COOKIE, result.miss, cookieOptions(request, handle, MISS_MAX_AGE));
  if (result.clear) clearOyklaneId(response, request);
  return response;
}

/** The notice shown when the Oyklane account made an account here. */
export const OYKLANE_WELCOME = "You're signed in with your Oyklane account — the same sign-in works on every Oyklane store. Not you? Sign out below.";

export function clearCookie(response, request, handle, name) {
  response.cookies.set(name, "", cookieOptions(request, handle, 0));
}

/** A 303 redirect to a storefront path (see storefrontPath), with optional
 * query params — the POST/redirect/GET pattern every form here uses. */
export function redirectTo(request, handle, suffix, params = {}) {
  const target = new URL(storefrontPath(request.headers.get("host"), handle, suffix), request.url);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") target.searchParams.set(k, String(v));
  return NextResponse.redirect(target, { status: 303 });
}

export function withPrefill(response, request, handle, email) {
  response.cookies.set(PREFILL_COOKIE, String(email || "").slice(0, 200), cookieOptions(request, handle, 5 * 60));
  return response;
}

/** After any successful sign-in or sign-up: sets the session cookie and
 * goes to `target` (the cart or checkout they came from) or the account. */
export function signedInResponse(request, handle, token, target, idToken) {
  const response = redirectTo(request, handle, target || "/account");
  setShopperCookie(response, request, handle, token, idToken);
  clearCookie(response, request, handle, RETURN_COOKIE);
  clearCookie(response, request, handle, PREFILL_COOKIE);
  return response;
}

/** POSTs JSON to the API's storefront routes, forwarding the shopper's
 * session when there is one. Returns { ok, status, data }. */
export async function apiPost(handle, path, body, { token } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}/api/storefront/${handle}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token && { "x-shopper-token": token }) },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 503, data: { error: "We couldn't reach the store just now. Please try again." } };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * A small per-visitor limit for actions that send email (sign-in codes).
 * The API limits per email address; this stops one visitor spraying codes
 * at many different addresses. In-memory per storefront process — a
 * speed bump, not a wall, which is all it needs to be.
 */
const hits = new Map();
export function visitorAllowed(request, key, { max, windowMs }) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
  const id = `${key}:${ip}`;
  const now = Date.now();
  const entry = hits.get(id);
  if (!entry || entry.resetAt < now) {
    hits.set(id, { count: 1, resetAt: now + windowMs });
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}
