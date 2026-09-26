import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL } from "./render";
import { storefrontPath, isDomainRequest } from "./domain";

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
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

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

export function setShopperCookie(response, request, handle, token) {
  response.cookies.set(SHOPPER_COOKIE, token, cookieOptions(request, handle, SESSION_MAX_AGE));
}

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
export function signedInResponse(request, handle, token, target) {
  const response = redirectTo(request, handle, target || "/account");
  setShopperCookie(response, request, handle, token);
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
