import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL, CART_COOKIE } from "@/lib/render";
import { storefrontPath } from "@/lib/domain";
import { retryUrl, safeReturnPath, ONE_CLICK_RETURN_COOKIE } from "@/lib/payments";

/**
 * Where a payment gateway sends the shopper back (GET from Stripe, PayPal
 * and Cashfree; a form POST from PayU). The API confirms the payment with
 * the gateway itself — nothing here is trusted on its own — and the
 * shopper lands on the thank-you page, or (payment not done, or cancelled
 * on the gateway: ?cancelled=1) back where they checked out from: the
 * page they opened the One-Click popup on (reopened), else checkout.
 *
 * PayU's POST comes from PayU's own site, so the browser leaves this
 * store's cookies off it (SameSite=Lax) — and those say where the shopper
 * started. So a POST is checked, then bounced to a plain GET of this same
 * route (?after=1), which does carry the cookies, to finish.
 */
async function confirm(handle, provider, orderId, params, cartId) {
  try {
    const res = await fetch(`${API_URL}/api/storefront/${encodeURIComponent(handle)}/checkout/payments/${encodeURIComponent(provider)}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId, params, cartId }),
      cache: "no-store",
    });
    const result = await res.json().catch(() => null);
    return res.ok ? result : { paid: false, message: result?.error };
  } catch {
    return { paid: false, message: "We couldn't reach the store to confirm your payment. If you were charged, contact the store." };
  }
}

export async function GET(request, { params }) {
  const { handle, provider } = await params;
  const sp = request.nextUrl.searchParams;
  const orderId = sp.get("order") || "";
  const after = sp.get("after") === "1";
  const cancelled = sp.get("cancelled") === "1";
  const all = Object.fromEntries(sp.entries());
  for (const k of ["order", "after", "cancelled", "msg"]) delete all[k];

  const jar = await cookies();
  // After the POST bounce the payment was already checked; asking again
  // only reads the order (a paid one says so without calling the gateway).
  const result = await confirm(handle, provider, orderId, after ? {} : all, jar.get(CART_COOKIE)?.value);
  const host = request.headers.get("host");

  if (result?.paid) {
    const url = new URL(storefrontPath(host, handle, "/checkout/confirmation"), request.url);
    url.searchParams.set("order", orderId);
    const response = NextResponse.redirect(url, { status: 303 });
    response.cookies.set(CART_COOKIE, "", { path: "/", maxAge: 0 });
    response.cookies.set(ONE_CLICK_RETURN_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }

  const said = after ? String(sp.get("msg") || "").slice(0, 200) : "";
  const message = cancelled
    ? "Payment was cancelled. Try again, or choose another way to pay."
    : said || result?.message || "Your payment wasn't completed. Try again, or choose another way to pay.";
  const oneClickFrom = safeReturnPath(jar.get(ONE_CLICK_RETURN_COOKIE)?.value);
  if (oneClickFrom) return NextResponse.redirect(retryUrl(request, oneClickFrom, message), { status: 303 });
  const url = new URL(storefrontPath(host, handle, "/checkout"), request.url);
  url.searchParams.set("checkoutError", message);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request, { params }) {
  const { handle, provider } = await params;
  const form = await request.formData().catch(() => null);
  const posted = form ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) : {};
  const sp = request.nextUrl.searchParams;
  const orderId = sp.get("order") || posted.order || "";
  delete posted.order;
  const result = await confirm(handle, provider, orderId, { ...Object.fromEntries(sp.entries()), ...posted });

  // Finish on a same-site GET, which carries the shopper's cookies.
  const next = new URL(request.url);
  next.search = "";
  next.searchParams.set("order", orderId);
  next.searchParams.set("after", "1");
  if (sp.get("cancelled") === "1") next.searchParams.set("cancelled", "1");
  if (!result?.paid && result?.message) next.searchParams.set("msg", String(result.message).slice(0, 200));
  return NextResponse.redirect(new URL(storefrontPath(request.headers.get("host"), handle, `/checkout/return/${provider}`) + next.search, request.url), { status: 303 });
}
