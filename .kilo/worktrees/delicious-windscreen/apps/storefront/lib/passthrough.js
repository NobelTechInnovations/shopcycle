import { API_URL } from "./render";

/** Streams a file from the API through the storefront, so theme files,
 * platform assets and uploaded images load from the store's own address
 * and the API's host never appears on a store page. `immutable` for
 * content-addressed URLs (versioned or random file names). */
export async function passthrough(path, { immutable = false } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  } catch {
    return new Response("Unavailable", { status: 503 });
  }
  if (!res.ok) return new Response("Not found", { status: res.status === 404 ? 404 : 502 });
  const headers = new Headers({ "content-type": res.headers.get("content-type") || "application/octet-stream" });
  headers.set("cache-control", immutable ? "public, max-age=31536000, s-maxage=31536000, immutable" : "public, max-age=300, s-maxage=300");
  headers.set("x-content-type-options", "nosniff");
  return new Response(res.body, { status: 200, headers });
}
