import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { proxyRender, API_URL, CART_COOKIE, VISITOR_COOKIE } from "@/lib/render";

export async function GET(request, { params }) {
  const { handle } = await params;
  const checkoutError = request.nextUrl.searchParams.get("checkoutError");
  return proxyRender(handle, "checkout", checkoutError ? { checkoutError } : {}, request);
}

/** Places the order server-side (never trusting anything the client could
 * have tampered with beyond what it typed into the form itself — the API
 * re-hydrates the cart from Redis/the DB to compute the real totals), then
 * either redirects straight to the confirmation page (Cash on Delivery,
 * fully settled at this point) or to the Razorpay payment page (order
 * exists server-side already, pending its online payment). */
export async function POST(request, { params }) {
  const { handle } = await params;
  const cookieStore = await cookies();
  const cartId = cookieStore.get(CART_COOKIE)?.value;
  const sessionId = cookieStore.get(VISITOR_COOKIE)?.value;

  const form = await request.formData();
  const body = {
    cartId,
    sessionId,
    email: form.get("email"),
    phone: form.get("phone"),
    shippingName: form.get("shippingName"),
    shippingAddress1: form.get("shippingAddress1"),
    shippingAddress2: form.get("shippingAddress2") || undefined,
    shippingCity: form.get("shippingCity"),
    shippingProvince: form.get("shippingProvince"),
    shippingZip: form.get("shippingZip"),
    shippingCountry: form.get("shippingCountry"),
    paymentMethod: form.get("paymentMethod") || "cod",
  };

  const res = await fetch(`${API_URL}/api/storefront/${handle}/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  let result = null;
  try {
    result = await res.json();
  } catch {
    /* non-JSON error body — result stays null, generic message below */
  }

  if (!res.ok) {
    const target = new URL(`/store/${handle}/checkout`, request.url);
    target.searchParams.set("checkoutError", result?.error || "Could not place your order. Please try again.");
    return NextResponse.redirect(target, { status: 303 });
  }

  const { order, razorpay } = result;

  let target;
  if (razorpay) {
    target = new URL(`/store/${handle}/checkout/pay`, request.url);
    target.searchParams.set("order", order.id);
    target.searchParams.set("rzpOrderId", razorpay.orderId);
    target.searchParams.set("amount", String(razorpay.amount));
    target.searchParams.set("key", razorpay.keyId);
  } else {
    target = new URL(`/store/${handle}/checkout/confirmation`, request.url);
    target.searchParams.set("order", order.id);
  }

  const response = NextResponse.redirect(target, { status: 303 });
  // The order is fully placed either way (COD settled, or a pending
  // Razorpay order created) — the cart's job is done, clear its cookie too
  // so a shopper who navigates back to the cart sees it empty rather than
  // a cart the server has already discarded.
  response.cookies.set(CART_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
