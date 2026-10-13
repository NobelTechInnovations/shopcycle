const { env } = require("../config/env");
const templates = require("./whatsapp-templates");

/**
 * The one way the platform sends SMS and WhatsApp messages (one-time
 * sign-in codes). Like the mailer, it never throws and logs every message
 * in MessageLog; with no provider configured the message is only logged,
 * body included, so development and tests need no account.
 *
 *   SMS:      APITXT OTP API (default), Twilio, MSG91 (India, DLT template)
 *   WhatsApp: Zoho CPaaS, Twilio, Meta WhatsApp Cloud API (approved template)
 */

function smsProvider() {
  const p = env.SMS_PROVIDER || (env.APITXT_AUTH_KEY ? "apitxt" : env.MSG91_AUTH_KEY ? "msg91" : env.TWILIO_ACCOUNT_SID ? "twilio" : "log");
  if (p === "apitxt" && !env.APITXT_AUTH_KEY) return "log";
  if (p === "twilio" && !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && (env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_SMS_FROM))) return "log";
  if (p === "msg91" && !(env.MSG91_AUTH_KEY && env.MSG91_OTP_TEMPLATE_ID)) return "log";
  return p;
}

const zohoToken = () => String(env.ZOHO_CPAAS_TOKEN || env.ZEPTOMAIL_TOKEN || "").replace(/^Zoho-enczapikey\s+/i, "").trim();

/**
 * Oyklane's own WhatsApp number (Super admin ▸ Messaging ▸ Oyklane
 * WhatsApp) with its approved "oy_login_code" Authentication template —
 * used for codes only when no other WhatsApp provider is set up. Checked in
 * the background (jobs tick and each send), so channels() stays synchronous.
 */
const platformOtp = { at: 0, ready: false };
function refreshPlatformOtp(prisma) {
  if (!prisma || Date.now() - platformOtp.at < 60 * 1000) return;
  platformOtp.at = Date.now();
  (async () => {
    const platform = require("../modules/whatsapp/platform");
    const cloud = require("../modules/whatsapp/cloud");
    const { OTP_TEMPLATE } = require("../modules/whatsapp/standard-templates");
    const conn = await platform.connection(prisma);
    platformOtp.ready = Boolean(conn) && (await cloud.listTemplates(conn)).some((t) => t.name === OTP_TEMPLATE && t.status === "APPROVED");
  })().catch(() => {
    platformOtp.ready = false;
  });
}

function whatsappProvider() {
  // Zoho's code template is set in Super admin ▸ Messaging (whatsapp-templates.js).
  const zohoReady = zohoToken() && env.ZOHO_WHATSAPP_FROM && templates.otpTemplate();
  const p = env.WHATSAPP_PROVIDER || (zohoReady ? "zoho" : env.META_WHATSAPP_TOKEN ? "meta" : env.TWILIO_WHATSAPP_FROM ? "twilio" : "log");
  if (p === "zoho" && !zohoReady) return "log";
  if (p === "twilio" && !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM)) return "log";
  if (p === "meta" && !(env.META_WHATSAPP_TOKEN && env.META_WHATSAPP_PHONE_NUMBER_ID && env.META_WHATSAPP_OTP_TEMPLATE)) return platformOtp.ready ? "oyklane" : "log";
  if (p === "log" && platformOtp.ready) return "oyklane";
  return p;
}

/** Which channels can actually deliver a code right now. */
function channels() {
  return { sms: smsProvider() !== "log", whatsapp: whatsappProvider() !== "log" };
}

/** What Super admin ▸ Messaging shows about the WhatsApp setup — never the token. */
function whatsappStatus() {
  const t = templates.cached().otp;
  return {
    provider: whatsappProvider(),
    forced: env.WHATSAPP_PROVIDER || null,
    zohoAccount: Boolean(zohoToken()),
    from: env.ZOHO_WHATSAPP_FROM || null,
    // Meta's free test numbers are +1 555 …: they only reach a few
    // allow-listed phones and have tight limits — not for real shoppers.
    testNumber: /^1555\d{7}$/.test(String(env.ZOHO_WHATSAPP_FROM || "").replace(/\D/g, "")),
    otpTemplateFrom: t?.templateKey ? "super_admin" : env.ZOHO_WHATSAPP_TEMPLATE_KEY ? "env" : null,
    sms: smsProvider(),
    smsPrice: env.SMS_OTP_PRICE,
  };
}

async function request(url, { headers = {}, body, form = false }) {
  const res = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": form ? "application/x-www-form-urlencoded" : "application/json", ...headers },
    body: form ? new URLSearchParams(body) : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!res.ok || data?.type === "error") {
    const detail = data?.message || data?.error?.message || data?.error_message || text.slice(0, 200);
    throw new Error(`${res.status}: ${detail}`);
  }
  return data || {};
}

const twilioAuth = () => `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`;
const twilioUrl = () => `${env.TWILIO_API_URL}/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;

/** APITXT's country code for a number (E.164 digits): India and
 * US/Canada are unambiguous; anything else goes with its full number. */
function apitxtCountry(to) {
  if (/^91\d{10}$/.test(to)) return "91";
  if (/^1\d{10}$/.test(to)) return "1";
  return null;
}

const SENDERS = {
  sms: {
    // APITXT unified OTP API — we generate the code, it delivers it with
    // its (DLT-registered) OTP template. Failed deliveries are refunded by APITXT.
    async apitxt({ to, code }) {
      const body = new URLSearchParams({ authkey: env.APITXT_AUTH_KEY, mobile: to, otp: code, channel: "sms" });
      const country = apitxtCountry(to);
      if (country) body.set("country", country);
      if (env.APITXT_TEMPLATE_ID) body.set("template_id", env.APITXT_TEMPLATE_ID);
      const res = await fetch(env.APITXT_API_URL, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {}
      if (!res.ok || String(data?.status || "").toLowerCase() !== "success") {
        // Never echo the request (it carries the key) — only APITXT's answer.
        const detail = [data?.code || data?.error_code, data?.message || data?.error || text.slice(0, 160)].filter(Boolean).join(" ");
        throw new Error(`APITXT ${res.status}: ${detail || "no response"}`);
      }
      return data?.data?.request_id || null;
    },
    async twilio({ to, text }) {
      const body = { To: `+${to}`, Body: text };
      if (env.TWILIO_MESSAGING_SERVICE_SID) body.MessagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID;
      else body.From = env.TWILIO_SMS_FROM;
      const data = await request(twilioUrl(), { headers: { authorization: twilioAuth() }, body, form: true });
      return data.sid || null;
    },
    async msg91({ to, code }) {
      const data = await request(`${env.MSG91_API_URL}/flow`, {
        headers: { authkey: env.MSG91_AUTH_KEY },
        body: { template_id: env.MSG91_OTP_TEMPLATE_ID, short_url: "0", recipients: [{ mobiles: to, [env.MSG91_OTP_VAR]: code }] },
      });
      return data.message || data.request_id || null;
    },
  },
  whatsapp: {
    async zoho({ to, code }) {
      const from = env.ZOHO_WHATSAPP_FROM.startsWith("+") ? env.ZOHO_WHATSAPP_FROM : `+${env.ZOHO_WHATSAPP_FROM}`;
      const t = templates.otpTemplate();
      const data = await request(`${env.ZOHO_CPAAS_API_URL.replace(/\/$/, "")}/whatsapp`, {
        headers: { authorization: `Zoho-enczapikey ${zohoToken()}` },
        body: { from, to: `+${to}`, template_key: t.templateKey, merge_info: { [t.vars.code || "code"]: code } },
      });
      return data.request_id || data.data?.[0]?.message_id || data.message_id || null;
    },
    async twilio({ to, code, text }) {
      const from = env.TWILIO_WHATSAPP_FROM.replace(/^whatsapp:/, "");
      const body = { To: `whatsapp:+${to}`, From: `whatsapp:${from.startsWith("+") ? from : `+${from}`}` };
      if (env.TWILIO_WHATSAPP_CONTENT_SID) {
        body.ContentSid = env.TWILIO_WHATSAPP_CONTENT_SID;
        body.ContentVariables = JSON.stringify({ 1: code });
      } else body.Body = text;
      const data = await request(twilioUrl(), { headers: { authorization: twilioAuth() }, body, form: true });
      return data.sid || null;
    },
    async meta({ to, code }) {
      const components = [{ type: "body", parameters: [{ type: "text", text: code }] }];
      if (env.META_WHATSAPP_OTP_BUTTON) components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] });
      const data = await request(`${env.META_GRAPH_API_URL}/${env.META_GRAPH_API_VERSION}/${env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        headers: { authorization: `Bearer ${env.META_WHATSAPP_TOKEN}` },
        body: {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: { name: env.META_WHATSAPP_OTP_TEMPLATE, language: { code: env.META_WHATSAPP_OTP_LANGUAGE }, components },
        },
      });
      return data.messages?.[0]?.id || null;
    },
    // Oyklane's own number, Authentication template with a copy-code button.
    async oyklane({ to, code, prisma }) {
      const platform = require("../modules/whatsapp/platform");
      const cloud = require("../modules/whatsapp/cloud");
      const { OTP_TEMPLATE } = require("../modules/whatsapp/standard-templates");
      const conn = await platform.connection(prisma);
      if (!conn) throw new Error("Oyklane's WhatsApp number isn't connected");
      const sent = await cloud.send(conn, {
        to,
        type: "template",
        template: { name: OTP_TEMPLATE, language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: code }] }, { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] }] },
      });
      return sent.id;
    },
  },
};

/**
 * Sends a one-time code. `to` is E.164 digits without "+" (lib/phone.js).
 * @returns {{ status: "sent"|"logged"|"failed", provider: string, error?: string }}
 */
async function sendOtp(prisma, { to, code, channel = "sms", storeId = null, storeName = "Oyklane", log }) {
  templates.cached(prisma); // keeps Super admin's templates fresh (background, once a minute)
  refreshPlatformOtp(prisma);
  const provider = channel === "whatsapp" ? whatsappProvider() : smsProvider();
  const text = `${code} is your ${storeName} sign-in code. It expires in 10 minutes. Don't share it with anyone.`;
  let status = "logged";
  let providerMessageId = null;
  let error = null;

  if (provider !== "log") {
    try {
      providerMessageId = await SENDERS[channel][provider]({ to, code, text, prisma });
      status = "sent";
    } catch (err) {
      status = "failed";
      error = err.message || String(err);
      log?.warn({ err, channel, provider }, "messaging: send failed");
    }
  }

  // Each SMS code a store's shopper receives is billed to that store.
  if (status === "sent" && channel === "sms" && storeId) {
    await require("../modules/billing/usage")
      .chargeSmsCode(prisma, storeId, { log })
      .catch((err) => log?.error({ err, storeId }, "billing: couldn't record an SMS code charge"));
  }

  await prisma.messageLog
    .create({
      data: { storeId, channel, to, template: "sign_in_code", provider, status, providerMessageId: providerMessageId ? String(providerMessageId) : null, error, body: status === "logged" ? text : null },
    })
    .catch((err) => log?.error({ err }, "messaging: could not write the message log"));

  return { status, provider, ...(error && { error }) };
}

module.exports = { sendOtp, channels, smsProvider, whatsappProvider, whatsappStatus, refreshPlatformOtp };
