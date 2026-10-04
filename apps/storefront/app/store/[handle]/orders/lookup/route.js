import { proxyRender } from "@/lib/render";
import { apiPost, redirectTo } from "@/lib/shopper";

/** "Find your order" for guests: order number + email → the order's status page. */
export async function GET(request, { params }) {
  const { handle } = await params;
  return proxyRender(handle, "order-lookup", { formError: request.nextUrl.searchParams.get("formError") || "" }, request);
}

export async function POST(request, { params }) {
  const { handle } = await params;
  const form = await request.formData();
  const res = await apiPost(handle, "/orders/lookup", {
    orderNumber: String(form.get("orderNumber") || "").trim(),
    email: String(form.get("email") || "").trim(),
  });
  if (!res.ok || !res.data?.token) {
    return redirectTo(request, handle, "/orders/lookup", { formError: res.data?.error || "We couldn't find that order." });
  }
  return redirectTo(request, handle, `/orders/${encodeURIComponent(res.data.token)}`);
}
