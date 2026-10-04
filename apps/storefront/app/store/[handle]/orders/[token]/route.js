import { proxyRender } from "@/lib/render";

/** The order status page linked from every order email — progress,
 * tracking, items, invoice and returns. The unguessable token in the URL
 * is the key, so guests can use it without an account. */
export async function GET(request, { params }) {
  const { handle, token } = await params;
  const sp = request.nextUrl.searchParams;
  return proxyRender(
    handle,
    "order-status",
    { orderToken: token, notice: sp.get("notice") || "", formError: sp.get("formError") || "" },
    request
  );
}
