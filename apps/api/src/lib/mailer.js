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
  if (!env.SMTP_HOST) return null;
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

function emailConfigured() {
  return Boolean(env.SMTP_HOST);
}

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
 * @returns {{ status: "sent"|"logged"|"failed", id: string|null, error?: string }}
 */
async function sendEmail(prisma, { to, subject, html, template, storeId = null, fromName, replyTo, refType, refId, log }) {
  const from = parseFrom(env.EMAIL_FROM);
  const sender = { name: fromName || from.name, address: from.address };
  const smtp = getTransport();

  let status = "logged";
  let providerMessageId = null;
  let error = null;

  if (smtp) {
    try {
      const info = await smtp.sendMail({
        from: sender,
        to,
        replyTo: replyTo || undefined,
        subject,
        html,
        text: htmlToText(html),
      });
      status = "sent";
      providerMessageId = info.messageId || null;
    } catch (err) {
      status = "failed";
      error = err.message || String(err);
      log?.warn({ err, template, to }, "mailer: send failed");
    }
  }

  let id = null;
  try {
    const row = await prisma.emailLog.create({
      data: {
        storeId,
        to,
        subject,
        template: template || "other",
        refType: refType || null,
        refId: refId || null,
        status,
        provider: smtp ? "smtp" : "log",
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

module.exports = { sendEmail, emailConfigured, htmlToText, parseFrom };
