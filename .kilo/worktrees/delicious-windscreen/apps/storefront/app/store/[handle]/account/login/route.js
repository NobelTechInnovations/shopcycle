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
  LOGIN_PHONE_COOKIE,
  PHONE_CHANNEL_COOKIE,
  PHONE_TICKET_COOKIE,
  PHONE_PROFILE_COOKIE,
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

const PHONE_COOKIES = [LOGIN_PHONE_COOKIE, PHONE_CHANNEL_COOKIE, PHONE_TICKET_COOKIE, PHONE_PROFILE_COOKIE];

function readProfile(value) {
  try {
    const p = JSON.parse(value || "{}");
    return { name: String(p.name || "").slice(0, 120), email: String(p.email || "").slice(0, 200) };
  } catch {
    return { name: "", email: "" };
  }
}

/** Phone sign-in pages: which step we're on comes from the cookies each
 * earlier step set, so a step can't be reached out of order. */
async function phoneGET(request, handle, sp) {
  const jar = await cookies();
  if (sp.get("change")) {
    const response = redirectTo(request, handle, "/account/login", { mode: "phone" });
    for (const name of PHONE_COOKIES) clearCookie(response, request, handle, name);
    return response;
  }
  const phone = jar.get(LOGIN_PHONE_COOKIE)?.value || "";
  const ticket = jar.get(PHONE_TICKET_COOKIE)?.value || "";
  const profile = readProfile(jar.get(PHONE_PROFILE_COOKIE)?.value);
  const wanted = sp.get("step");
  const step =
    wanted === "phone-email-code" && ticket && profile.email ? wanted : wanted === "phone-profile" && ticket ? wanted : wanted === "phone-code" && phone ? wanted : "phone";
  const returnTo = RETURN_TARGETS[sp.get("return_to")] ? sp.get("return_to") : "";
  return proxyRender(
    handle,
    "account-login",
    {
      loginMode: "phone",
      loginStep: step,
      loginPhone: phone,
      loginEmail: profile.email,
      formError: sp.get("formError") || "",
      notice: sp.get("notice") || "",
      ...(returnTo && { returnTo }),
    },
    request
  );
}

async function phonePOST(request, handle, intent, form) {
  const jar = await cookies();
  const back = (step, extra = {}) => redirectTo(request, handle, "/account/login", { mode: "phone", ...(step && { step }), ...extra });
  const phone = jar.get(LOGIN_PHONE_COOKIE)?.value || "";
  const ticket = jar.get(PHONE_TICKET_COOKIE)?.value || "";

  if (intent === "phone-request" || intent === "phone-resend") {
    if (!visitorAllowed(request, "phone-code", { max: 5, windowMs: 10 * 60 * 1000 })) {
      return back(intent === "phone-resend" ? "phone-code" : "", { formError: "Too many codes requested from this device. Try again in a few minutes." });
    }
    const number = intent === "phone-resend" ? phone : String(form.get("phone") || "").trim();
    const channel = intent === "phone-resend" ? jar.get(PHONE_CHANNEL_COOKIE)?.value : String(form.get("channel") || "");
    if (!number) return back("", { formError: "Your sign-in timed out. Enter your number again." });
    const res = await apiPost(handle, "/account/phone/code", { phone: number, ...(channel && { channel }) });
    if (!res.ok) return back(intent === "phone-resend" ? "phone-code" : "", { formError: res.data?.error || "Enter a valid mobile number." });
    const response = back("phone-code", intent === "phone-resend" ? { notice: "A new code is on its way." } : {});
    response.cookies.set(LOGIN_PHONE_COOKIE, res.data.phone, cookieOptions(request, handle, EMAIL_STEP_MAX_AGE));
    response.cookies.set(PHONE_CHANNEL_COOKIE, res.data.channel, cookieOptions(request, handle, EMAIL_STEP_MAX_AGE));
    const returnTo = String(form.get("return_to") || "");
    if (RETURN_TARGETS[returnTo]) response.cookies.set(RETURN_COOKIE, returnTo, cookieOptions(request, handle, EMAIL_STEP_MAX_AGE));
    return response;
  }

  const savedReturn = jar.get(RETURN_COOKIE)?.value;
  const done = (token) => {
    const response = signedInResponse(request, handle, token, RETURN_TARGETS[savedReturn]);
    for (const name of PHONE_COOKIES) clearCookie(response, request, handle, name);
    return response;
  };

  if (intent === "phone-verify") {
    if (!phone) return back("", { formError: "Your sign-in timed out. Enter your number again." });
    const res = await apiPost(handle, "/account/phone/verify", { phone, code: String(form.get("code") || "") });
    if (!res.ok) return back("phone-code", { formError: res.data?.error || "That code didn't work." });
    if (res.data?.token) return done(res.data.token);
    const response = back("phone-profile");
    response.cookies.set(PHONE_TICKET_COOKIE, res.data.signupTicket, cookieOptions(request, handle, 20 * 60));
    return response;
  }

  if (!ticket) return back("", { formError: "Your number check expired. Enter your number again." });

  if (intent === "phone-profile") {
    const profile = { name: String(form.get("name") || "").trim().slice(0, 120), email: String(form.get("email") || "").trim().toLowerCase().slice(0, 200) };
    const res = await apiPost(handle, "/account/phone/complete", { ticket, ...profile });
    if (!res.ok) return back("phone-profile", { formError: res.data?.error || "Check your name and email." });
    if (res.data?.token) return done(res.data.token);
    const response = back("phone-email-code", { notice: "We emailed you a 6-digit code." });
    response.cookies.set(PHONE_PROFILE_COOKIE, JSON.stringify(profile), cookieOptions(request, handle, 20 * 60));
    return response;
  }

  // phone-email-verify
  const profile = readProfile(jar.get(PHONE_PROFILE_COOKIE)?.value);
  if (!profile.email) return back("phone-profile", { formError: "Enter your name and email again." });
  const res = await apiPost(handle, "/account/phone/complete", { ticket, ...profile, code: String(form.get("code") || "") });
  if (!res.ok || !res.data?.token) return back("phone-email-code", { formError: res.data?.error || "That code didn't work." });
  return done(res.data.token);
}

export async function GET(request, { params }) {
  const { handle } = await params;
  const sp = request.nextUrl.searchParams;
  if (sp.get("mode") === "phone") return phoneGET(request, handle, sp);
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
  if (intent.startsWith("phone-")) return phonePOST(request, handle, intent, form);
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
