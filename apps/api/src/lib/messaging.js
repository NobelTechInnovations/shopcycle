const { env } = require("../config/env");

/**
 * The one way the platform sends SMS and WhatsApp messages (one-time
 * sign-in codes). Like the mailer, it never throws and logs every message
 * in MessageLog; with no provider configured the message is only logged,
 * body included, so development and tests need no account.
 *
 *   SMS:      Twilio, MSG91 (India, DLT template)
 *   WhatsApp: Zoho CPaaS, Twilio, Meta WhatsApp Cloud API (approved template)
 */

function smsProvider() {
  const p = env.SMS_PROVIDER || (env.MSG91_AUTH_KEY ? "msg91" : env.TWILIO_ACCOUNT_SID ? "twilio" : "log");
  if (p === "twilio" && !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && (env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_SMS_FROM))) return "log";
  if (p === "msg91" && !(env.MSG91_AUTH_KEY && env.MSG91_OTP_TEMPLATE_ID)) return "log";
  return p;
}

const zohoToken = () => String(env.ZOHO_CPAAS_TOKEN || env.ZEPTOMAIL_TOKEN || "").replace(/^Zoho-enczapikey\s+/i, "").trim();

function whatsappProvider() {
  const p = env.WHATSAPP_PROVIDER || (env.ZOHO_WHATSAPP_TEMPLATE_KEY ? "zoho" : env.META_WHATSAPP_TOKEN ? "meta" : env.TWILIO_WHATSAPP_FROM ? "twilio" : "log");
  if (p === "zoho" && !(zohoToken() && env.ZOHO_WHATSAPP_FROM && env.ZOHO_WHATSAPP_TEMPLATE_KEY)) return "log";
  if (p === "twilio" && !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM)) return "log";
  if (p === "meta" && !(env.META_WHATSAPP_TOKEN && env.META_WHATSAPP_PHONE_NUMBER_ID && env.META_WHATSAPP_OTP_TEMPLATE)) return "log";
  return p;
}

/** Which channels can actually deliver a code right now. */
function channels() {
  return { sms: smsProvider() !== "log", whatsapp: whatsappProvider() !== "log" };
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

const SENDERS = {
  sms: {
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
      const data = await request(`${env.ZOHO_CPAAS_API_URL.replace(/\/$/, "")}/whatsapp`, {
        headers: { authorization: `Zoho-enczapikey ${zohoToken()}` },
        body: { from, to: `+${to}`, template_key: env.ZOHO_WHATSAPP_TEMPLATE_KEY, merge_info: { [env.ZOHO_WHATSAPP_MERGE_KEY]: code } },
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
  },
};

/**
 * Sends a one-time code. `to` is E.164 digits without "+" (lib/phone.js).
 * @returns {{ status: "sent"|"logged"|"failed", provider: string, error?: string }}
 */
async function sendOtp(prisma, { to, code, channel = "sms", storeId = null, storeName = "Oyklane", log }) {
  const provider = channel === "whatsapp" ? whatsappProvider() : smsProvider();
  const text = `${code} is your ${storeName} sign-in code. It expires in 10 minutes. Don't share it with anyone.`;
  let status = "logged";
  let providerMessageId = null;
  let error = null;

  if (provider !== "log") {
    try {
      providerMessageId = await SENDERS[channel][provider]({ to, code, text });
      status = "sent";
    } catch (err) {
      status = "failed";
      error = err.message || String(err);
      log?.warn({ err, channel, provider }, "messaging: send failed");
    }
  }

  await prisma.messageLog
    .create({
      data: { storeId, channel, to, template: "sign_in_code", provider, status, providerMessageId: providerMessageId ? String(providerMessageId) : null, error, body: status === "logged" ? text : null },
    })
    .catch((err) => log?.error({ err }, "messaging: could not write the message log"));

  return { status, provider, ...(error && { error }) };
}

module.exports = { sendOtp, channels, smsProvider, whatsappProvider };
