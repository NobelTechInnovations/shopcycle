import { CART_COOKIE } from "@/lib/render";
import { apiPost, redirectTo } from "@/lib/shopper";

const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** The link in an abandoned-checkout email: puts the saved cart back in
 * this browser (any device) and continues to checkout. */
export async function GET(request, { params }) {
  const { handle, token } = await params;
  const res = await apiPost(handle, "/cart/recover", { token });
  if (!res.ok || !res.data?.cartId) return redirectTo(request, handle, "/cart");
  const response = redirectTo(request, handle, "/checkout");
  response.cookies.set(CART_COOKIE, res.data.cartId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: CART_COOKIE_MAX_AGE });
  return response;
}
