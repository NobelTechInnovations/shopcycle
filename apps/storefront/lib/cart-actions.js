import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL, CART_COOKIE } from "./render";

const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Shared by the add/update route handlers: read the cart cookie, POST the
 * mutation to the API, redirect back (303 — the standard POST/redirect/GET
 * pattern, so a page refresh after add-to-cart doesn't resubmit the form),
 * and update the cookie if the API minted a new cart. */
export async function mutateCart(handle, endpoint, request, redirectPath) {
  const cookieStore = await cookies();
  const cartId = cookieStore.get(CART_COOKIE)?.value;

  const form = await request.formData();
  const variantId = form.get("variantId");
  const quantity = Number(form.get("quantity") || 1);

  const res = await fetch(`${API_URL}/api/storefront/${handle}/cart/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cartId, variantId, quantity }),
  });

  let cart = null;
  try {
    cart = (await res.json()).cart;
  } catch {
    /* API returned a non-JSON error — fall through, redirect still happens */
  }

  const response = NextResponse.redirect(new URL(redirectPath, request.url), { status: 303 });
  if (cart?.cartId) {
    response.cookies.set(CART_COOKIE, cart.cartId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: CART_COOKIE_MAX_AGE,
    });
  }
  return response;
}

/** Same POST/redirect/GET shape as mutateCart, for the discount-code
 * apply/remove forms — a different body shape (code, not variantId/qty),
 * so it's a separate small function rather than overloading mutateCart. */
export async function mutateCartDiscount(handle, endpoint, request, redirectPath) {
  const cookieStore = await cookies();
  const cartId = cookieStore.get(CART_COOKIE)?.value;

  const form = await request.formData();
  const code = form.get("code");

  const res = await fetch(`${API_URL}/api/storefront/${handle}/cart/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cartId, ...(code ? { code } : {}) }),
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body — fall through with body still null */
  }

  // A rejected code (expired, over its usage limit, wrong minimum) isn't a
  // "fail silently and redirect anyway" case — the shopper typed something
  // and needs to know why it didn't work.
  const target = new URL(redirectPath, request.url);
  if (!res.ok) {
    target.searchParams.set("discountError", body?.error || "That discount code isn't valid.");
  }

  const response = NextResponse.redirect(target, { status: 303 });
  if (body?.cart?.cartId) {
    response.cookies.set(CART_COOKIE, body.cart.cartId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: CART_COOKIE_MAX_AGE,
    });
  }
  return response;
}
