import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL, CART_COOKIE } from "./render";
import { storefrontPath } from "./domain";

const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Asked for JSON (the cart drawer's fetch), not a page. */
export function wantsJson(request) {
  return (request.headers.get("accept") || "").includes("application/json");
}

/** The cart as the drawer reads it — item links under this store's own
 * root (they come from the API under /store/:handle). */
export function publicCart(cart, request, handle) {
  if (!cart) return null;
  const host = request.headers.get("host");
  return {
    ...cart,
    items: (cart.items || []).map((item) => ({
      ...item,
      url: storefrontPath(host, handle, String(item.url || "").replace(/^\/store\/[^/]+/, "")),
    })),
  };
}

export function setCartCookie(response, cartId) {
  response.cookies.set(CART_COOKIE, cartId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: CART_COOKIE_MAX_AGE });
}

/** Shared by the add/update route handlers: read the cart cookie, POST the
 * mutation to the API, redirect back (303 — the standard POST/redirect/GET
 * pattern, so a page refresh after add-to-cart doesn't resubmit the form),
 * and update the cookie if the API minted a new cart. The cart drawer asks
 * for JSON instead and gets the updated cart back. */
export async function mutateCart(handle, endpoint, request) {
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
  let error = null;
  try {
    const body = await res.json();
    cart = body.cart;
    error = body.error;
  } catch {
    /* API returned a non-JSON error — fall through, redirect still happens */
  }

  if (wantsJson(request)) {
    const response = NextResponse.json(res.ok ? { cart: publicCart(cart, request, handle) } : { error: error || "Couldn't update your cart." }, {
      status: res.ok ? 200 : res.status,
    });
    if (cart?.cartId) setCartCookie(response, cart.cartId);
    return response;
  }

  const redirectPath = storefrontPath(request.headers.get("host"), handle, "/cart");
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

// Where a code form may send the shopper back to.
const BACK_TARGETS = { cart: "/cart", checkout: "/checkout" };

/** Same POST/redirect/GET shape as mutateCart, for the discount-code and
 * gift-card forms: a code instead of a variant, and a rejected code comes
 * back as `errorParam` on the page — the shopper typed something and
 * needs to know why it didn't work. */
async function mutateCartCode(handle, endpoint, request, errorParam, fallbackError) {
  const cookieStore = await cookies();
  const cartId = cookieStore.get(CART_COOKIE)?.value;

  const form = await request.formData();
  const code = form.get("code");
  const back = BACK_TARGETS[String(form.get("back") || "")] || "/cart";

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

  const target = new URL(storefrontPath(request.headers.get("host"), handle, back), request.url);
  if (!res.ok) target.searchParams.set(errorParam, body?.error || fallbackError);

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

export function mutateCartDiscount(handle, endpoint, request) {
  return mutateCartCode(handle, endpoint, request, "discountError", "That discount code isn't valid.");
}

export function mutateCartGiftCard(handle, endpoint, request) {
  return mutateCartCode(handle, endpoint, request, "giftCardError", "That gift card code isn't valid.");
}
