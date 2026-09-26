import { API_URL } from "@/lib/render";

/** The order's GST invoice as a printable page. */
export async function GET(request, { params }) {
  const { handle, token } = await params;
  let res;
  try {
    res = await fetch(`${API_URL}/api/storefront/${handle}/orders/${encodeURIComponent(token)}/invoice`, { cache: "no-store" });
  } catch {
    return new Response("The store is unavailable right now.", { status: 503 });
  }
  if (!res.ok) {
    let message = "There's no invoice for this order yet.";
    try {
      message = (await res.json()).error || message;
    } catch {
      /* keep default */
    }
    return new Response(message, { status: res.status, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response(await res.text(), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
  });
}
