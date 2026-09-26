import { apiPost, redirectTo, setShopperCookie, shopperToken } from "@/lib/shopper";

/** Sets or changes the password from the account page. The API signs out
 * every other device and returns a fresh session for this one. */
export async function POST(request, { params }) {
  const { handle } = await params;
  const token = await shopperToken();
  if (!token) return redirectTo(request, handle, "/account/login");

  const form = await request.formData();
  const password = String(form.get("password") || "");
  if (password !== String(form.get("confirmPassword") || "")) {
    return redirectTo(request, handle, "/account", { formError: "The two passwords don't match." });
  }
  const res = await apiPost(handle, "/account/password", { currentPassword: String(form.get("currentPassword") || ""), password }, { token });
  if (res.status === 401) return redirectTo(request, handle, "/account/login", { formError: "Please sign in again." });
  if (!res.ok || !res.data?.token) return redirectTo(request, handle, "/account", { formError: res.data?.error || "Couldn't save your password." });
  const response = redirectTo(request, handle, "/account", { notice: "Your password is saved. Other devices have been signed out." });
  setShopperCookie(response, request, handle, res.data.token);
  return response;
}
