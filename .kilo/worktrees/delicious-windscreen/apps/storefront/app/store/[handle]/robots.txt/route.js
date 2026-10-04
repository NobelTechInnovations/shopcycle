import { API_URL } from "@/lib/render";

/** robots.txt for the store (at the domain root on a store's own domain). */
export async function GET(request, { params }) {
  const { handle } = await params;
  const res = await fetch(`${API_URL}/api/storefront/${handle}/robots.txt`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return new Response("User-agent: *\nDisallow:\n", { headers: { "content-type": "text/plain" } });
  return new Response(await res.text(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
