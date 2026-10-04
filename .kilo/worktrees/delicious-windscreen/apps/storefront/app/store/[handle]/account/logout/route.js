import { SHOPPER_COOKIE, PHONE_TICKET_COOKIE, clearCookie, redirectTo } from "@/lib/shopper";
import { CART_COOKIE } from "@/lib/render";
import { ONE_CLICK_RETURN_COOKIE } from "@/lib/payments";

/** Signs the shopper out of this browser — and empties what belonged to
 * them here: the cart and any checkout in progress, so the next person on
 * this device starts clean. POST only, so a link or an image on another
 * site can't sign anyone out. */
export async function POST(request, { params }) {
  const { handle } = await params;
  const response = redirectTo(request, handle, "/", { signedOut: "1" });
  clearCookie(response, request, handle, SHOPPER_COOKIE);
  clearCookie(response, request, handle, PHONE_TICKET_COOKIE);
  response.cookies.set(CART_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(ONE_CLICK_RETURN_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
