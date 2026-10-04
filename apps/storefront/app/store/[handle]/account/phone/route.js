import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  apiPost,
  cookieOptions,
  clearCookie,
  setShopperCookie,
  visitorAllowed,
  LOGIN_PHONE_COOKIE,
  LOGIN_EMAIL_COOKIE,
  PHONE_TICKET_COOKIE,
  PHONE_PROFILE_COOKIE,
} from "@/lib/shopper";

/**
 * Phone sign-in from the popup (login-popup.js) — the same steps as the
 * sign-in page's phone mode, as JSON:
 *   { action: "code", phone, channel? }  → { phone, channel }
 *   { action: "verify", code }           → { done } | { profile: true }
 *   { action: "profile", name, email }   → { done } | { emailCode: email }
 *   { action: "email-code", code }       → { done }
 * and, when a phone code can't be sent, sign-in by an emailed code:
 *   { action: "email-send", email }      → { email }
 *   { action: "email-verify", code }     → { done }
 * The number, the "number verified" ticket and the profile live in
 * HttpOnly cookies between steps (never in the page); { done } means the
 * session cookie is set.
 */
const STEP_MAX_AGE = 20 * 60;
const STEP_COOKIES = [LOGIN_PHONE_COOKIE, LOGIN_EMAIL_COOKIE, PHONE_TICKET_COOKIE, PHONE_PROFILE_COOKIE];

function fail(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request, { params }) {
  const { handle } = await params;
  const jar = await cookies();
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* ignore */
  }
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const done = (token, idToken) => {
    const response = NextResponse.json({ done: true });
    setShopperCookie(response, request, handle, token, idToken);
    for (const name of STEP_COOKIES) clearCookie(response, request, handle, name);
    return response;
  };

  if (body.action === "code") {
    if (!visitorAllowed(request, "phone-code", { max: 5, windowMs: 10 * 60 * 1000 })) {
      return fail("Too many codes requested from this device. Try again in a few minutes.", 429);
    }
    const channel = ["sms", "whatsapp"].includes(body.channel) ? body.channel : undefined;
    const res = await apiPost(handle, "/account/phone/code", { phone: str(body.phone, 24), ...(channel && { channel }) });
    if (!res.ok) return fail(res.data?.error || "Enter a valid mobile number.", res.status);
    const response = NextResponse.json({ phone: res.data.phone, channel: res.data.channel });
    response.cookies.set(LOGIN_PHONE_COOKIE, res.data.phone, cookieOptions(request, handle, STEP_MAX_AGE));
    return response;
  }

  if (body.action === "verify") {
    const phone = jar.get(LOGIN_PHONE_COOKIE)?.value;
    if (!phone) return fail("Your sign-in timed out. Enter your number again.");
    const res = await apiPost(handle, "/account/phone/verify", { phone, code: str(body.code, 12) });
    if (!res.ok) return fail(res.data?.error || "That code didn't work.", res.status);
    if (res.data?.token) return done(res.data.token, res.data.oyklaneId);
    const response = NextResponse.json({ profile: true });
    response.cookies.set(PHONE_TICKET_COOKIE, res.data.signupTicket, cookieOptions(request, handle, STEP_MAX_AGE));
    return response;
  }

  // The email fallback — the same emailed-code sign-in as the sign-in page.
  if (body.action === "email-send") {
    if (!visitorAllowed(request, "sign-in-code", { max: 10, windowMs: 10 * 60 * 1000 })) {
      return fail("Too many sign-in attempts from this device. Try again in a few minutes.", 429);
    }
    const email = str(body.email, 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email.");
    const res = await apiPost(handle, "/account/code", { email });
    if (!res.ok) return fail(res.data?.error || "We couldn't email a code. Try again.", res.status);
    const response = NextResponse.json({ email });
    response.cookies.set(LOGIN_EMAIL_COOKIE, email, cookieOptions(request, handle, STEP_MAX_AGE));
    return response;
  }
  if (body.action === "email-verify") {
    const email = jar.get(LOGIN_EMAIL_COOKIE)?.value;
    if (!email) return fail("Your sign-in timed out. Enter your email again.");
    const res = await apiPost(handle, "/account/code/verify", { email, code: str(body.code, 12) });
    if (!res.ok || !res.data?.token) return fail(res.data?.error || "That code didn't work.", res.ok ? 400 : res.status);
    return done(res.data.token, res.data.oyklaneId);
  }

  const ticket = jar.get(PHONE_TICKET_COOKIE)?.value;
  if (!ticket) return fail("Your number check expired. Enter your number again.");

  if (body.action === "profile") {
    const profile = { name: str(body.name, 120), email: str(body.email, 200).toLowerCase() };
    const res = await apiPost(handle, "/account/phone/complete", { ticket, ...profile });
    if (!res.ok) return fail(res.data?.error || "Check your name and email.", res.status);
    if (res.data?.token) return done(res.data.token, res.data.oyklaneId);
    const response = NextResponse.json({ emailCode: profile.email });
    response.cookies.set(PHONE_PROFILE_COOKIE, JSON.stringify(profile), cookieOptions(request, handle, STEP_MAX_AGE));
    return response;
  }

  if (body.action === "email-code") {
    let profile = {};
    try {
      profile = JSON.parse(jar.get(PHONE_PROFILE_COOKIE)?.value || "{}");
    } catch {
      /* ignore */
    }
    if (!profile.email) return fail("Enter your name and email again.");
    const res = await apiPost(handle, "/account/phone/complete", { ticket, name: String(profile.name || ""), email: String(profile.email), code: str(body.code, 12) });
    if (!res.ok || !res.data?.token) return fail(res.data?.error || "That code didn't work.", res.ok ? 400 : res.status);
    return done(res.data.token, res.data.oyklaneId);
  }

  return fail("Unknown action");
}
