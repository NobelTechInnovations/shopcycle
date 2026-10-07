import { proxyRender } from "@/lib/render";
import { apiPost, redirectTo, shopperToken, visitorAllowed } from "@/lib/shopper";

/** The store's Contact page: its details and a form. A message goes to
 * the seller's Customers ▸ Queries; the seller answers by email. */
export async function GET(request, { params }) {
  const { handle } = await params;
  return proxyRender(handle, "contact", {}, request);
}

export async function POST(request, { params }) {
  const { handle } = await params;
  const form = await request.formData();
  if (!visitorAllowed(request, "contact", { max: 8, windowMs: 60 * 60 * 1000 })) {
    return redirectTo(request, handle, "/contact", { formError: "You've sent a few messages already — the store will reply soon." });
  }
  const field = (name) => String(form.get(name) || "").trim();
  const res = await apiPost(handle, "/contact", {
    name: field("name"),
    email: field("email"),
    phone: field("phone"),
    message: field("message"),
    website: field("website"),
  }, { token: await shopperToken() });
  return redirectTo(
    request,
    handle,
    "/contact",
    res.ok ? { notice: "Thank you! Your message has been sent — we'll reply to your email soon." } : { formError: firstError(res.data) }
  );
}

/** The first field's message ("Enter a valid email…"), else the error. */
function firstError(data) {
  const fields = data?.details && typeof data.details === "object" ? Object.values(data.details).flat() : [];
  return fields.find((m) => typeof m === "string") || data?.error || "Your message couldn't be sent. Check the form and try again.";
}
