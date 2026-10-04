import { apiPost, redirectTo, visitorAllowed } from "@/lib/shopper";

/** Rentals app, request mode: "Request to book" on a product page. The
 * store gets the request and calls the shopper to confirm — no payment
 * here. Back to the product with a thank-you (or what to fix). */
export async function POST(request, { params }) {
  const { handle } = await params;
  const form = await request.formData();
  const back = safeBack(handle, form.get("return_to"));

  if (!visitorAllowed(request, "rental-request", { max: 10, windowMs: 10 * 60 * 1000 })) {
    return redirectTo(request, handle, back, { formError: "Too many requests from this device. Try again in a few minutes." });
  }
  const field = (name) => String(form.get(name) || "").trim();
  const res = await apiPost(handle, "/apps/rentals/request", {
    variantId: field("variantId"),
    quantity: Number(form.get("quantity") || 1),
    start: field("rentalStart"),
    end: field("rentalEnd") || field("rentalStart"),
    handover: field("rentalHandover") || undefined,
    returnMethod: field("rentalReturn") || undefined,
    name: field("rentalName"),
    phone: field("rentalPhone"),
    email: field("rentalEmail"),
    address: field("rentalAddress"),
    note: field("rentalNote"),
  });
  return redirectTo(request, handle, back, res.ok ? { notice: res.data?.message || "Request sent!" } : { formError: res.data?.error || "Your request couldn't be sent. Please try again." });
}

/** Only a path inside this store — never an outside URL. */
function safeBack(handle, value) {
  const raw = typeof value === "string" ? value : "";
  const prefix = `/store/${handle}`;
  const path = raw.startsWith(prefix) ? raw.slice(prefix.length) || "/" : raw;
  return /^\/(?!\/)[\w\-./]*$/.test(path) ? path : "/";
}
