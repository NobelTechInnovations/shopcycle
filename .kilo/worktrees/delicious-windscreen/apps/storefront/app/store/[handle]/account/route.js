import { proxyRender } from "@/lib/render";
import { shopperToken, redirectTo } from "@/lib/shopper";

/** The shopper's account page — orders and saved details. Signed-out
 * visitors go to sign in first. */
export async function GET(request, { params }) {
  const { handle } = await params;
  if (!(await shopperToken())) return redirectTo(request, handle, "/account/login");
  const sp = request.nextUrl.searchParams;
  return proxyRender(handle, "account", { notice: sp.get("notice") || "", formError: sp.get("formError") || "" }, request);
}
