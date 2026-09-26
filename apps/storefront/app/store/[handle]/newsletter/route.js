import { apiPost, redirectTo, visitorAllowed } from "@/lib/shopper";

/** Newsletter signup from any page's form. Goes back to the page it came
 * from with a thank-you (or the error) as ?notice= / ?formError=. */
export async function POST(request, { params }) {
  const { handle } = await params;
  const form = await request.formData();
  const email = String(form.get("email") || "").trim();
  const back = safeBack(request, handle, form.get("return_to"));

  if (!visitorAllowed(request, "newsletter", { max: 20, windowMs: 10 * 60 * 1000 })) {
    return redirectTo(request, handle, back, { formError: "Too many signups from this device. Try again later." });
  }
  const res = await apiPost(handle, "/newsletter", { email });
  return redirectTo(
    request,
    handle,
    back,
    res.ok ? { notice: "Thanks for subscribing! Watch your inbox for news and offers." } : { formError: res.data?.error || "Enter a valid email." }
  );
}

/** Only a path inside this store — never an outside URL. */
function safeBack(request, handle, value) {
  const raw = typeof value === "string" ? value : "";
  const prefix = `/store/${handle}`;
  const path = raw.startsWith(prefix) ? raw.slice(prefix.length) || "/" : raw;
  return /^\/(?!\/)[\w\-./]*$/.test(path) ? path : "/";
}
