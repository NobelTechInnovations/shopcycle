const nodemailer = require("nodemailer");
const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { encryptSecret, decryptSecret } = require("../../lib/crypto");
const entitlements = require("../billing/entitlements");

/**
 * Settings ▸ Notifications ▸ "Your own email server" (Pro plan): emails
 * to the store's customers (order confirmations, shipping, refunds,
 * contact replies…) go out through the seller's own SMTP server, from
 * their own address. What Oyklane sends the seller (sign-in, billing,
 * alerts) always comes from Oyklane. Kept in store.settings.smtp, the
 * password encrypted.
 */

const FEATURE = "custom_email";

/** Templates that go to shoppers — the only ones the seller's server sends. */
const SHOPPER_TEMPLATES = new Set([
  "order_confirmation",
  "shipping_update",
  "order_delivered",
  "order_cancelled",
  "refund_issued",
  "return_update",
  "gift_card",
  "abandoned_checkout",
  "contact_reply",
  "rental_request_received",
  "rental_confirmed",
  "flow",
  "sign_in_code",
]);

const inputSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().min(3, "Enter the SMTP server, e.g. smtp.zoho.in").max(200).regex(/^[a-z0-9.-]+$/i, "Enter just the server name, e.g. smtp.gmail.com"),
  port: z.coerce.number().int().refine((p) => [25, 465, 587, 2525].includes(p), "Use port 465 (SSL) or 587 (STARTTLS)"),
  user: z.string().trim().min(1, "Enter the username (usually your email address)").max(200),
  // Empty keeps the saved password.
  password: z.string().max(300).optional(),
  fromEmail: z.string().trim().toLowerCase().email("Enter the address customers see emails from").max(200),
  fromName: z.string().trim().max(80).optional(),
});

const read = (store) => (store?.settings && typeof store.settings === "object" && store.settings.smtp) || null;

function transportFor(s) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.user, pass: decryptSecret(s.password) },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  });
}

/** For the settings page — never the password. */
async function forAdmin(prisma, store) {
  const ent = await entitlements.forStore(prisma, store.id);
  const s = read(store);
  return {
    allowed: entitlements.has(ent, FEATURE),
    plan: ent?.plan?.name || null,
    settings: s ? { enabled: Boolean(s.enabled), host: s.host, port: s.port, user: s.user, fromEmail: s.fromEmail, fromName: s.fromName || "", hasPassword: Boolean(s.password) } : null,
    lastError: s?.lastError || null,
    lastErrorAt: s?.lastErrorAt || null,
  };
}

/** Saves after checking the server accepts the login (when it's on). */
async function save(prisma, store, input) {
  entitlements.assertFeature(await entitlements.forStore(prisma, store.id), FEATURE, "Sending from your own email server");
  const body = inputSchema.parse(input || {});
  const old = read(store);
  const password = body.password ? encryptSecret(body.password) : old?.password;
  if (!password) throw new HttpError(400, "Enter the SMTP password (an app password for Gmail / Zoho).");
  const smtp = { enabled: body.enabled, host: body.host.toLowerCase(), port: body.port, user: body.user, password, fromEmail: body.fromEmail, fromName: body.fromName || "", lastError: null, lastErrorAt: null };
  if (smtp.enabled) {
    try {
      await transportFor(smtp).verify();
    } catch (err) {
      throw new HttpError(400, `Your email server refused the connection: ${String(err.message || err).slice(0, 200)}`);
    }
  }
  const settings = { ...(store.settings || {}), smtp };
  const updated = await prisma.store.update({ where: { id: store.id }, data: { settings } });
  return forAdmin(prisma, updated);
}

/** A test email through the saved server, sent now. */
async function sendTest(prisma, store, to) {
  entitlements.assertFeature(await entitlements.forStore(prisma, store.id), FEATURE, "Sending from your own email server");
  const s = read(store);
  if (!s?.password) throw new HttpError(400, "Save your email server first.");
  const address = z.string().trim().email("Enter an email address").parse(to);
  try {
    await transportFor(s).sendMail({
      from: { name: s.fromName || store.name, address: s.fromEmail },
      to: address,
      subject: `Test email from ${store.name}`,
      text: `This came through your own email server (${s.host}). Customer emails from ${store.name} will be sent this way.`,
    });
  } catch (err) {
    throw new HttpError(400, `Couldn't send: ${String(err.message || err).slice(0, 200)}`);
  }
  return { ok: true };
}

/**
 * The mailer asks: should this queued email go through the store's own
 * server? Returns a sender (send(message) → message id) or null.
 */
async function senderFor(prisma, storeId, template) {
  if (!storeId || !SHOPPER_TEMPLATES.has(template)) return null;
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, settings: true } });
  const s = read(store);
  if (!s?.enabled || !s.password) return null;
  if (!entitlements.has(await entitlements.forStore(prisma, storeId), FEATURE)) return null;
  return {
    async send({ to, replyTo, subject, html, text, fromName }) {
      const info = await transportFor(s).sendMail({ from: { name: s.fromName || fromName || store.name, address: s.fromEmail }, to, replyTo: replyTo || undefined, subject, html, text });
      return info.messageId;
    },
    /** Its last failure, shown on the settings page. */
    async failed(err) {
      const fresh = await prisma.store.findUnique({ where: { id: storeId }, select: { settings: true } });
      const cur = read(fresh);
      if (!cur) return;
      await prisma.store.update({ where: { id: storeId }, data: { settings: { ...fresh.settings, smtp: { ...cur, lastError: String(err.message || err).slice(0, 300), lastErrorAt: new Date().toISOString() } } } });
    },
  };
}

module.exports = { SHOPPER_TEMPLATES, forAdmin, save, sendTest, senderFor };
