import { cookies } from "next/headers";
import { proxyRender } from "@/lib/render";
import {
  LOGIN_EMAIL_COOKIE,
  RETURN_COOKIE,
  RETURN_TARGETS,
  signedInResponse,
  apiPost,
  clearCookie,
  cookieOptions,
  redirectTo,
  visitorAllowed,
  PREFILL_COOKIE,
  withPrefill,
} from "@/lib/shopper";

/**
 * Shopper sign-in, two ways on one URL:
 *   password (default) → email + password; the API returns a session
 *   ?mode=code         → by emailed code, in two steps:
 *     1. email → the API emails a 6-digit code; the address is kept in a
 *                short-lived HttpOnly cookie (not the URL) for step 2
 *     2. code  → the API checks it and returns a session
 * Either way we set the session cookie and go to the account page (or
 * back to the cart/checkout). Sign-up lives at /account/register.
 * Plain forms with POST/redirect/GET — works without JavaScript.
 */

const EMAIL_STEP_MAX_AGE = 15 * 60;

export async function GET(request, { params }) {
  const { handle } = await params;
  const sp = request.nextUrl.searchParams;
  const pendingEmail = (await cookies()).get(LOGIN_EMAIL_COOKIE)?.value || "";

  if (sp.get("change")) {
    const response = redirectTo(request, handle, "/account/login", { mode: "code" });
    clearCookie(response, request, handle, LOGIN_EMAIL_COOKIE);
    return response;
  }

  const step = sp.get("step") === "code" && pendingEmail ? "code" : "email";
  const mode = sp.get("mode") === "code" || step === "code" ? "code" : "password";
  const returnTo = RETURN_TARGETS[sp.get("return_to")] ? sp.get("return_to") : "";
  return proxyRender(
    handle,
    "account-login",
    {
      loginStep: step,
      loginMode: mode,
      loginEmail: mode === "code" ? pendingEmail : (await cookies()).get(PREFILL_COOKIE)?.value || "",
      formError: sp.get("formError") || "",
      notice: sp.get("notice") || "",
      ...(returnTo && { returnTo }),
    },
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
  const returnTo = String(form.get("return_to") || "");

  if (intent === "password") {
    const email = String(form.get("email") || "").trim().toLowerCase();
    if (!visitorAllowed(request, "sign-in-password", { max: 20, windowMs: 10 * 60 * 1000 })) {
      return redirectTo(request, handle, "/account/login", { formError: "Too many sign-in attempts from this device. Try again in a few minutes." });
    }
    const res = await apiPost(handle, "/account/password-login", { email, password: String(form.get("password") || "") });
    if (!res.ok || !res.data?.token) {
      // The email goes back into the form (via a short-lived cookie, not
      // the URL); the password never does.
      return withPrefill(
        redirectTo(request, handle, "/account/login", {
          formError: res.data?.error || "Email or password is incorrect.",
          ...(RETURN_TARGETS[returnTo] && { return_to: returnTo }),
        }),
        request,
        handle,
        email
      );
    }
    return signedInResponse(request, handle, res.data.token, RETURN_TARGETS[returnTo]);
  }

  if (intent === "request") {
    const email = String(form.get("email") || "").trim().toLowerCase();
    const res = await sendCode(request, handle, email);
    if (!res.ok) return redirectTo(request, handle, "/account/login", { formError: res.data?.error || "Enter a valid email." });
    const response = redirectTo(request, handle, "/account/login", { step: "code" });
    response.cookies.set(LOGIN_EMAIL_COOKIE, email, cookieOptions(request, handle, EMAIL_STEP_MAX_AGE));
    if (RETURN_TARGETS[returnTo]) response.cookies.set(RETURN_COOKIE, returnTo, cookieOptions(request, handle, EMAIL_STEP_MAX_AGE));
    return response;
  }

  if (!pendingEmail) {
    return redirectTo(request, handle, "/account/login", { mode: "code", formError: "Your sign-in timed out. Enter your email again." });
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
  const savedReturn = (await cookies()).get(RETURN_COOKIE)?.value;
  const response = signedInResponse(request, handle, res.data.token, RETURN_TARGETS[savedReturn]);
  clearCookie(response, request, handle, LOGIN_EMAIL_COOKIE);
  return response;
}
