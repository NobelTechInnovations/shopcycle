import { apiPost, redirectTo, shopperToken } from "@/lib/shopper";

const FIELDS = ["name", "phone", "address1", "address2", "city", "province", "zip", "country"];

/** Saves the shopper's name, phone and default address from the account page. */
export async function POST(request, { params }) {
  const { handle } = await params;
  const token = await shopperToken();
  if (!token) return redirectTo(request, handle, "/account/login");

  const form = await request.formData();
  const body = Object.fromEntries(FIELDS.map((f) => [f, String(form.get(f) || "").trim()]));
  body.acceptsEmailMarketing = form.get("acceptsEmailMarketing") === "true";

  const res = await apiPost(handle, "/account/profile", body, { token });
  if (res.status === 401) return redirectTo(request, handle, "/account/login", { formError: "Please sign in again." });
  return redirectTo(
    request,
    handle,
    "/account",
    res.ok ? { notice: "Your details are saved." } : { formError: res.data?.error || "Couldn't save your details." }
  );
}
