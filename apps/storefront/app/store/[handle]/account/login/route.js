import { cookies } from "next/headers";
import { proxyRender } from "@/lib/render";
import {
  LOGIN_EMAIL_COOKIE,
  apiPost,
  clearCookie,
  cookieOptions,
  redirectTo,
  setShopperCookie,
  visitorAllowed,
} from "@/lib/shopper";

/**
 * Shopper sign-in by emailed code, in two steps on one URL:
 *   1. email  → the API emails a 6-digit code; the address is kept in a
 *               short-lived HttpOnly cookie (not the URL) for step 2
 *   2. code   → the API checks it and returns a session; we set the
 *               session cookie and go to the account page
 * Plain forms with POST/redirect/GET — works without JavaScript.
 */

const EMAIL_STEP_MAX_AGE = 15 * 60;
const RETURN_COOKIE = "sc_login_return";
// Where a shopper may be sent back to after signing in.
const RETURN_TARGETS = { checkout: "/checkout", cart: "/cart" };

export async function GET(request, { params }) {
  const { handle } = await params;
  const sp = request.nextUrl.searchParams;
  const pendingEmail = (await cookies()).get(LOGIN_EMAIL_COOKIE)?.value || "";

  if (sp.get("change")) {
    const response = redirectTo(request, handle, "/account/login");
    clearCookie(response, request, handle, LOGIN_EMAIL_COOKIE);
    return response;
  }

  const step = sp.get("step") === "code" && pendingEmail ? "code" : "email";
  const returnTo = RETURN_TARGETS[sp.get("return_to")] ? sp.get("return_to") : "";
  return proxyRender(
    handle,
    "account-login",
    { loginStep: step, loginEmail: pendingEmail, formError: sp.get("formError") || "", notice: sp.get("notice") || "", ...(returnTo && { returnTo }) },
    request
  );
}

async function sendCode(request, handle, email) {
  if (!visitorAllowed(request, "sign-in-code", { max: 10, windowMs: 10 * 60 * 1000 })) {
    return { ok: false, data: { error: "Too many sign-in attempts from this device. Try again in a few minutes." } };
  }
  return apiPost(handle, "/account/code", { email });
}

export async function POST(request, { params }) {
  const { handle } = await params;
  const form = await request.formData();
  const intent = String(form.get("intent") || "request");
  const pendingEmail = (await cookies()).get(LOGIN_EMAIL_COOKIE)?.value || "";

  if (intent === "request") {
    const email = String(form.get("email") || "").trim().toLowerCase();
    const res = await sendCode(request, handle, email);
    if (!res.ok) return redirectTo(request, handle, "/account/login", { formError: res.data?.error || "Enter a valid email." });
    const response = redirectTo(request, handle, "/account/login", { step: "code" });
    response.cookies.set(LOGIN_EMAIL_COOKIE, email, cookieOptions(request, handle, EMAIL_STEP_MAX_AGE));
    const returnTo = String(form.get("return_to") || "");
    if (RETURN_TARGETS[returnTo]) response.cookies.set(RETURN_COOKIE, returnTo, cookieOptions(request, handle, EMAIL_STEP_MAX_AGE));
    return response;
  }

  if (!pendingEmail) {
    return redirectTo(request, handle, "/account/login", { formError: "Your sign-in timed out. Enter your email again." });
  }

  if (intent === "resend") {
    const res = await sendCode(request, handle, pendingEmail);
    return redirectTo(request, handle, "/account/login", {
      step: "code",
      ...(res.ok ? { notice: "A new code is on its way." } : { formError: res.data?.error || "Couldn't send a new code." }),
    });
  }

  const res = await apiPost(handle, "/account/code/verify", { email: pendingEmail, code: String(form.get("code") || "") });
  if (!res.ok || !res.data?.token) {
    return redirectTo(request, handle, "/account/login", { step: "code", formError: res.data?.error || "That code didn't work." });
  }
  const returnTo = (await cookies()).get(RETURN_COOKIE)?.value;
  const response = redirectTo(request, handle, RETURN_TARGETS[returnTo] || "/account");
  setShopperCookie(response, request, handle, res.data.token);
  clearCookie(response, request, handle, LOGIN_EMAIL_COOKIE);
  clearCookie(response, request, handle, RETURN_COOKIE);
  return response;
}
