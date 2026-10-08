const nodemailer = require("nodemailer");
const { env } = require("../config/env");

/**
 * The one way the platform sends email. Every message — to a seller or to
 * a shopper on a store's behalf — is recorded in EmailLog (see its doc
 * comment in schema.prisma), whether it was sent, kept locally, or failed.
 *
 * sendEmail never throws and never waits for the provider: it queues the
 * message (EmailLog status "queued") and returns at once; a worker in this
 * process delivers it, retrying a few times, and the jobs tick drains
 * anything left after a restart. A slow or blocked provider can't hold up
 * a sign-up or a checkout.
 */
const RETRY_MINUTES = [1, 5, 15];
const STUCK_MS = 10 * 60 * 1000;

let transport = null;
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      // Fail fast (default is 2 minutes) — e.g. hosts that block SMTP ports.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    });
  }
  return transport;
}

/** "smtp" | "zeptomail" | "brevo" | "log" — see EMAIL_PROVIDER in env.js. */
function emailProvider() {
  const p = env.EMAIL_PROVIDER || (env.SMTP_HOST ? "smtp" : "log");
  if (p === "smtp" && !env.SMTP_HOST) return "log";
  if (p === "zeptomail" && !zohoKey()) return "log";
  if (p === "brevo" && !env.BREVO_API_KEY) return "log";
  return p;
}

/** The Zoho key, whichever name it was given, without its prefix. */
function zohoKey() {
  return String(env.ZEPTOMAIL_TOKEN || env.ZOHO_CPAAS_TOKEN || "").replace(/^Zoho-enczapikey\s+/i, "").trim();
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
      { authorization: `Zoho-enczapikey ${zohoKey()}` },
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
 * @returns {{ status: "queued"|"logged"|"failed", id: string|null }}
 */
async function sendEmail(prisma, { to, subject, html, template, storeId = null, fromName, replyTo, refType, refId, logSubject, log }) {
  const provider = emailProvider();
  const base = { storeId, to, subject: logSubject || subject, template: template || "other", refType: refType || null, refId: refId || null, provider };
  try {
    if (provider === "log") {
      const row = await prisma.emailLog.create({ data: { ...base, status: "logged", html } });
      return { status: "logged", id: row.id };
    }
    const row = await prisma.emailLog.create({ data: { ...base, status: "queued", payload: { subject, html, fromName: fromName || null, replyTo: replyTo || null } } });
    kick(prisma, log);
    return { status: "queued", id: row.id };
  } catch (err) {
    log?.error({ err, template }, "mailer: could not queue the email");
    return { status: "failed", id: null };
  }
}

/** Sends one message now, straight to the provider (used by the queue). */
async function sendNow({ to, subject, html, fromName, replyTo }) {
  const provider = emailProvider();
  if (provider === "log") throw new Error("No email provider is configured.");
  const from = parseFrom(env.EMAIL_FROM);
  const sender = { name: fromName || from.name, address: from.address };
  return { provider, providerMessageId: await PROVIDERS[provider]({ sender, to, replyTo, subject, html, text: htmlToText(html) }) };
}

/** A Pro store's own email server sends its customer emails
 * (modules/store-email). If that server fails, Oyklane's sends it instead
 * — the shopper still gets it — and the seller sees the error. */
async function viaStoreServer(prisma, row, p, log) {
  // Lazy: store-email needs billing, which needs this module.
  const own = await require("../modules/store-email/service")
    .senderFor(prisma, row.storeId, row.template)
    .catch(() => null);
  if (!own) return null;
  try {
    const html = p.html || "";
    const id = await own.send({ to: row.to, replyTo: p.replyTo, subject: p.subject || row.subject, html, text: htmlToText(html), fromName: p.fromName });
    return { provider: "store_smtp", providerMessageId: id };
  } catch (err) {
    log?.warn({ err, storeId: row.storeId }, "mailer: store's own SMTP failed, sending through Oyklane");
    await own.failed(err).catch(() => {});
    return null;
  }
}

async function deliver(prisma, row, log) {
  const p = row.payload || {};
  try {
    const { provider, providerMessageId } =
      (await viaStoreServer(prisma, row, p, log)) || (await sendNow({ to: row.to, subject: p.subject || row.subject, html: p.html || "", fromName: p.fromName, replyTo: p.replyTo }));
    await prisma.emailLog.update({ where: { id: row.id }, data: { status: "sent", attempts: row.attempts + 1, provider, providerMessageId: providerMessageId ? String(providerMessageId) : null, error: null, payload: {}, sentAt: new Date(), nextAttemptAt: null } });
  } catch (err) {
    const attempts = row.attempts + 1;
    const retryIn = RETRY_MINUTES[attempts - 1];
    log?.warn({ err, template: row.template, to: row.to, attempts }, "mailer: send failed");
    await prisma.emailLog.update({
      where: { id: row.id },
      data: retryIn
        ? { status: "queued", attempts, error: String(err.message || err).slice(0, 500), nextAttemptAt: new Date(Date.now() + retryIn * 60000) }
        : { status: "failed", attempts, error: String(err.message || err).slice(0, 500), payload: {}, nextAttemptAt: null },
    });
    if (retryIn) setTimeout(() => kick(prisma, log), retryIn * 60000 + 1000).unref?.();
  }
}

/** Delivers queued emails that are due, oldest first. Safe to run from
 * several places at once: each row is claimed before it's sent. */
async function drainQueue(prisma, { log, limit = 50 } = {}) {
  // A process that died mid-send leaves rows in "sending": try them again.
  await prisma.emailLog.updateMany({ where: { status: "sending", nextAttemptAt: { lt: new Date(Date.now() - STUCK_MS) } }, data: { status: "queued" } });
  let sent = 0;
  for (let i = 0; i < limit; i += 1) {
    const row = await prisma.emailLog.findFirst({
      where: { status: "queued", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
      orderBy: { createdAt: "asc" },
    });
    if (!row) break;
    const claimed = await prisma.emailLog.updateMany({ where: { id: row.id, status: "queued" }, data: { status: "sending", nextAttemptAt: new Date() } });
    if (!claimed.count) continue;
    await deliver(prisma, row, log);
    sent += 1;
  }
  return sent;
}

let running = false;
let again = false;
function kick(prisma, log) {
  if (running) {
    again = true;
    return;
  }
  running = true;
  (async () => {
    do {
      again = false;
      await drainQueue(prisma, { log }).catch((err) => log?.error({ err }, "mailer: queue failed"));
    } while (again);
  })().finally(() => {
    running = false;
  });
}

module.exports = { sendEmail, sendNow, drainQueue, emailConfigured, emailProvider, htmlToText, parseFrom };
