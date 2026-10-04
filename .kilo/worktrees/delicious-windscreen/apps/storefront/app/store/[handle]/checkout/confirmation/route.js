import { proxyRender } from "@/lib/render";

export async function GET(request, { params }) {
  const { handle } = await params;
  const orderId = request.nextUrl.searchParams.get("order");
  return proxyRender(handle, "order-confirmation", orderId ? { orderId } : {}, request);
}
