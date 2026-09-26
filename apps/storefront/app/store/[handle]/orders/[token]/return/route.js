import { apiPost, redirectTo } from "@/lib/shopper";

/** A return request from the order status page. The form has one
 * "qty_<orderItemId>" select per returnable item. */
export async function POST(request, { params }) {
  const { handle, token } = await params;
  const form = await request.formData();
  const items = [];
  for (const [key, value] of form.entries()) {
    if (key.startsWith("qty_") && Number(value) > 0) items.push({ orderItemId: key.slice(4), quantity: Number(value) });
  }
  const back = `/orders/${encodeURIComponent(token)}`;
  if (!items.length) return redirectTo(request, handle, back, { formError: "Choose at least one item to return." });

  const res = await apiPost(handle, `/orders/${encodeURIComponent(token)}/returns`, {
    items,
    reason: String(form.get("reason") || ""),
    note: String(form.get("note") || ""),
  });
  return redirectTo(
    request,
    handle,
    back,
    res.ok
      ? { notice: "Your return request is in. We'll email you once it's reviewed." }
      : { formError: res.data?.error || "Couldn't send your return request." }
  );
}
