import { proxyRender } from "@/lib/render";
import { shopperToken, redirectTo, oyklaneSignIn, applyOyklane, userNavigated, OYKLANE_WELCOME } from "@/lib/shopper";

/** The shopper's account page — orders and saved details. Signed-out
 * visitors go to sign in first — unless they're signed in to another
 * Oyklane store, which signs them in here (lib/shopper.js oyklaneSignIn). */
export async function GET(request, { params }) {
  const { handle } = await params;
  const sp = request.nextUrl.searchParams;
  let oyklane;
  if (!(await shopperToken())) {
    oyklane = await oyklaneSignIn(request, handle, { create: userNavigated(request) });
    if (!oyklane?.token) return applyOyklane(redirectTo(request, handle, "/account/login"), request, handle, oyklane);
  }
  const notice = sp.get("notice") || (oyklane?.created ? OYKLANE_WELCOME : "");
  return proxyRender(handle, "account", { notice, formError: sp.get("formError") || "" }, request, oyklane ? { oyklane } : {});
}
