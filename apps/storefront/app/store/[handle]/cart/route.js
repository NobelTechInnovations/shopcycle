import { proxyRender } from "@/lib/render";

export async function GET(request, { params }) {
  const { handle } = await params;
  const discountError = request.nextUrl.searchParams.get("discountError");
  return proxyRender(handle, "cart", discountError ? { discountError } : {}, request);
}
