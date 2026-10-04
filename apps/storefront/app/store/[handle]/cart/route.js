import { proxyRender } from "@/lib/render";

export async function GET(request, { params }) {
  const { handle } = await params;
  const sp = request.nextUrl.searchParams;
  const flash = Object.fromEntries(["discountError", "giftCardError"].filter((k) => sp.get(k)).map((k) => [k, sp.get(k)]));
  return proxyRender(handle, "cart", flash, request);
}
