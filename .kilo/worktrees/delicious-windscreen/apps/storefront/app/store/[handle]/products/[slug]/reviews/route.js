import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api-url";
import { storefrontPath } from "@/lib/domain";

/** The product page's "Write a review" form (Product Reviews app): send it
 * to the API, then back to the product with a thank-you or the problem. */
export async function POST(request, { params }) {
  const { handle, slug } = await params;
  const form = await request.formData();
  const body = Object.fromEntries(["rating", "name", "email", "title", "body"].map((k) => [k, String(form.get(k) || "").slice(0, 4000)]));
  let message = null;
  let ok = false;
  try {
    const res = await fetch(`${API_URL}/api/storefront/${encodeURIComponent(handle)}/products/${encodeURIComponent(slug)}/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    ok = res.ok;
    message = ok
      ? data.status === "published"
        ? "Thanks — your review is live."
        : "Thanks — your review will appear once the store has checked it."
      : data.error || "Couldn't send your review. Try again.";
  } catch {
    message = "Couldn't send your review. Try again.";
  }
  const target = new URL(storefrontPath(request.headers.get("host"), handle, `/products/${slug}`), request.url);
  target.searchParams.set(ok ? "notice" : "formError", message);
  target.hash = "reviews";
  return NextResponse.redirect(target, { status: 303 });
}
