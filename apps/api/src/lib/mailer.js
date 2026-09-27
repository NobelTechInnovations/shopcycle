const nodemailer = require("nodemailer");
const { env } = require("../config/env");

/**
 * The one way the platform sends email. Every message — to a seller or to
 * a shopper on a store's behalf — is recorded in EmailLog (see its doc
 * comment in schema.prisma), whether it was sent, kept locally, or failed.
 *
 * sendEmail never throws: an email is always a side effect of something
 * that has already happened (an order placed, a refund issued), and a
 * provider outage must not turn that into an error for the person who did
 * it. Callers that need to know (the "resend" buttons) read the result.
 */

let transport = null;
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

/** "smtp" | "zeptomail" | "brevo" | "log" — see EMAIL_PROVIDER in env.js. */
function emailProvider() {
  const p = env.EMAIL_PROVIDER || (env.SMTP_HOST ? "smtp" : "log");
  if (p === "smtp" && !env.SMTP_HOST) return "log";
  if (p === "zeptomail" && !env.ZEPTOMAIL_TOKEN) return "log";
  if (p === "brevo" && !env.BREVO_API_KEY) return "log";
  return p;
}

function emailConfigured() {
  return emailProvider() !== "log";
}

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    const detail = data?.error?.details?.[0]?.message || data?.error?.message || data?.message || text.slice(0, 200);
    throw new Error(`${res.status}: ${detail}`);
  }
  return data || {};
}

/** Sends one message; returns the provider's message id. */
const PROVIDERS = {
  async smtp({ sender, to, replyTo, subject, html, text }) {
    const info = await getTransport().sendMail({ from: sender, to, replyTo: replyTo || undefined, subject, html, text });
    return info.messageId || null;
  },
  async zeptomail({ sender, to, replyTo, subject, html, text }) {
    const data = await postJson(
      env.ZEPTOMAIL_API_URL,
      { authorization: `Zoho-enczapikey ${env.ZEPTOMAIL_TOKEN.replace(/^Zoho-enczapikey\s+/i, "")}` },
      {
        from: { address: sender.address, name: sender.name },
        to: [{ email_address: { address: to } }],
        ...(replyTo && { reply_to: [{ address: replyTo }] }),
        subject,
        htmlbody: html,
        textbody: text,
      }
    );
    return data.request_id || data.data?.[0]?.message_id || null;
  },
  async brevo({ sender, to, replyTo, subject, html, text }) {
    const data = await postJson(
      env.BREVO_API_URL,
      { "api-key": env.BREVO_API_KEY },
      {
        sender: { email: sender.address, name: sender.name },
        to: [{ email: to }],
        ...(replyTo && { replyTo: { email: replyTo } }),
        subject,
        htmlContent: html,
        textContent: text,
      }
    );
    return data.messageId || null;
  },
};

/** "Oyklane <no-reply@oyklane.com>" → { name, address } */
function parseFrom(from) {
  const m = String(from).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim(), address: m[2].trim() } : { name: "", address: String(from).trim() };
}

/** Plain-text alternative for clients that don't render HTML (and for spam
 * filters, which distrust HTML-only mail). */
function htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * @param prisma
 * @param {object} message
 *   to, subject, html      — required
 *   template               — short name for the log ("order_confirmation")
 *   storeId                — set for anything sent on a store's behalf
 *   fromName               — display name; defaults to EMAIL_FROM's
 *   replyTo                — e.g. the store's support email
 *   refType, refId         — what it's about, e.g. ("order", order.id)
 *   logSubject             — what the log records instead of the real
 *                            subject, for subjects carrying a secret
 *                            (a sign-in code) that staff shouldn't read
 * @returns {{ status: "sent"|"logged"|"failed", id: string|null, error?: string }}
 */
async function sendEmail(prisma, { to, subject, html, template, storeId = null, fromName, replyTo, refType, refId, logSubject, log }) {
  const from = parseFrom(env.EMAIL_FROM);
  const sender = { name: fromName || from.name, address: from.address };
  const provider = emailProvider();

  let status = "logged";
  let providerMessageId = null;
  let error = null;

  if (provider !== "log") {
    try {
      providerMessageId = await PROVIDERS[provider]({ sender, to, replyTo, subject, html, text: htmlToText(html) });
      status = "sent";
    } catch (err) {
      status = "failed";
      error = err.message || String(err);
      log?.warn({ err, template, to, provider }, "mailer: send failed");
    }
  }

  let id = null;
  try {
    const row = await prisma.emailLog.create({
      data: {
        storeId,
        to,
        subject: logSubject || subject,
        template: template || "other",
        refType: refType || null,
        refId: refId || null,
        status,
        provider,
        providerMessageId,
        error,
        html: status === "logged" ? html : null,
      },
    });
    id = row.id;
  } catch (err) {
    log?.error({ err, template }, "mailer: could not write the email log");
  }

  return { status, id, ...(error && { error }) };
}

module.exports = { sendEmail, emailConfigured, emailProvider, htmlToText, parseFrom };
