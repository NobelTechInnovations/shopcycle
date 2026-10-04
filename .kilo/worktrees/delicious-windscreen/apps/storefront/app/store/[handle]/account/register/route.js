import { cookies } from "next/headers";
import { proxyRender } from "@/lib/render";
import {
  PREFILL_COOKIE,
  RETURN_TARGETS,
  apiPost,
  redirectTo,
  shopperToken,
  signedInResponse,
  visitorAllowed,
  withPrefill,
} from "@/lib/shopper";

/** Create an account with a name, email and password. Signed-in visitors
 * go straight to their account. */
export async function GET(request, { params }) {
  const { handle } = await params;
  if (await shopperToken()) return redirectTo(request, handle, "/account");
  const sp = request.nextUrl.searchParams;
  const returnTo = RETURN_TARGETS[sp.get("return_to")] ? sp.get("return_to") : "";
  return proxyRender(
    handle,
    "account-login",
    {
      loginMode: "register",
      loginEmail: (await cookies()).get(PREFILL_COOKIE)?.value || "",
      formError: sp.get("formError") || "",
      ...(returnTo && { returnTo }),
    },
    request
  );
}

export async function POST(request, { params }) {
  const { handle } = await params;
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const returnTo = String(form.get("return_to") || "");
  const back = (formError) =>
    withPrefill(
      redirectTo(request, handle, "/account/register", { formError, ...(RETURN_TARGETS[returnTo] && { return_to: returnTo }) }),
      request,
      handle,
      email
    );

  if (!visitorAllowed(request, "sign-up", { max: 10, windowMs: 10 * 60 * 1000 })) {
    return back("Too many sign-ups from this device. Try again in a few minutes.");
  }
  const res = await apiPost(handle, "/account/register", {
    name: String(form.get("name") || "").trim(),
    email,
    password: String(form.get("password") || ""),
    acceptsMarketing: form.get("acceptsMarketing") === "true",
  });
  if (!res.ok || !res.data?.token) return back(res.data?.error || "We couldn't create your account. Please try again.");
  return signedInResponse(request, handle, res.data.token, RETURN_TARGETS[returnTo]);
}
