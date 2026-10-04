import { NextResponse } from "next/server";
import { apiPost, visitorAllowed, shopperToken, setShopperCookie, cookieOptions, PHONE_TICKET_COOKIE } from "@/lib/shopper";

/**
 * The One-Click Checkout popup's calls, same-origin so they work on a
 * store's own domain:
 *   { action: "code",   phone }       → sends a code (or { otp: false })
 *   { action: "verify", phone, code } → { phone, name, email, addresses, signedIn? }
 *   { action: "mine" }                → a signed-in shopper's saved details
 * Verifying a number that has an account signs the shopper in (session
 * cookie); a new number gets a "confirmed" ticket cookie that the order
 * uses to create their account and sign them in. Neither is ever handed to
 * the page. The API limits codes per number and per store; this adds a
 * per-visitor limit so one visitor can't spray codes at many numbers.
 */
export async function POST(request, { params }) {
  const { handle } = await params;
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* ignore */
  }
  const phone = typeof body.phone === "string" ? body.phone.slice(0, 24) : "";

  if (body.action === "code") {
    if (!visitorAllowed(request, `express-code:${handle}`, { max: 6, windowMs: 10 * 60 * 1000 })) {
      return NextResponse.json({ error: "Too many codes requested. Please wait a few minutes and try again." }, { status: 429 });
    }
    const res = await apiPost(handle, "/checkout/express/code", { phone });
    return NextResponse.json(res.data || {}, { status: res.status });
  }

  if (body.action === "verify") {
    const code = typeof body.code === "string" ? body.code.slice(0, 12) : "";
    const res = await apiPost(handle, "/checkout/express/verify", { phone, code });
    if (!res.ok) return NextResponse.json(res.data || {}, { status: res.status });
    const { token, ticket, oyklaneId, ...data } = res.data || {};
    const response = NextResponse.json(data);
    if (token) setShopperCookie(response, request, handle, token, oyklaneId);
    if (ticket) response.cookies.set(PHONE_TICKET_COOKIE, ticket, cookieOptions(request, handle, 30 * 60));
    return response;
  }

  if (body.action === "mine") {
    const token = await shopperToken();
    if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const res = await apiPost(handle, "/checkout/express/mine", {}, { token });
    return NextResponse.json(res.data || {}, { status: res.status });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
