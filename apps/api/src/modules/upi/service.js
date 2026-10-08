const crypto = require("crypto");
const QRCode = require("qrcode");
const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { sendEmail } = require("../../lib/mailer");
const templates = require("../../emails/templates");
const cartService = require("../cart/service");
const { addOrderEvent } = require("../orders/events");
const { storeInboxes } = require("../orders/notify");
const notify = require("../orders/notify");
const { cancelOrder } = require("../orders/operations");

/**
 * UPI QR app: shoppers pay the seller's own UPI ID by scanning a QR made
 * for the exact order amount. No gateway and no fee — and so no signal
 * from a bank. Two ways it gets confirmed:
 *   - automatically: the seller's phone forwards their bank's "credited"
 *     SMS here (an SMS-forwarder app → the store's secret link); the
 *     amount — unique among the QRs showing — picks the order;
 *   - by the seller pressing Received (Apps ▸ UPI QR).
 * The shopper may tap "I've paid" (the UPI reference is optional). The QR
 * page watches for the confirmation and moves on by itself.
 *
 * Only offered while no payment gateway is live — a live gateway confirms
 * UPI itself.
 *
 * Every QR is kept (upi_payments) for the app's numbers and history.
 */

const APP_KEY = "upi-qr";
const METHOD = "upi_qr";
const VPA = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;
const DEFAULT_MINUTES = 5;
const PAGE_SIZE = 25;

const settingsSchema = z.object({
  upiId: z.string().trim().toLowerCase().regex(VPA, "Enter a UPI ID like yourname@okhdfcbank"),
  payeeName: z.string().trim().min(2, "Enter the name on the UPI account").max(60),
  minutes: z.coerce.number().int().min(2).max(30).default(DEFAULT_MINUTES),
});

// Optional: a shopper who gives it lets the seller match faster.
const utrSchema = z
  .string()
  .optional()
  .nullable()
  .transform((v) => String(v || "").replace(/\s+/g, ""))
  .refine((v) => v === "" || /^\d{12}$/.test(v), "The UPI reference is the 12-digit number in your UPI app's payment details — or leave it empty.");

async function installed(prisma, storeId) {
  return prisma.storeApp.findFirst({ where: { storeId, app: { key: APP_KEY } }, select: { id: true, settings: true } });
}

function readSettings(row) {
  const s = (row?.settings && typeof row.settings === "object" && row.settings) || {};
  return {
    upiId: s.upiId || "",
    payeeName: s.payeeName || "",
    minutes: Number(s.minutes) || DEFAULT_MINUTES,
    autoSms: Boolean(s.autoSms && s.smsToken),
    smsToken: s.smsToken || null,
    lastSms: s.lastSms || null,
  };
}

/** The app's settings when it's installed and has a UPI ID, else null. */
async function activeSettings(prisma, storeId) {
  const row = await installed(prisma, storeId);
  if (!row) return null;
  const s = readSettings(row);
  return VPA.test(s.upiId) && s.payeeName ? s : null;
}

/** The live (not test) gateway that takes over UPI, if any. */
async function liveGateway(prisma, storeId) {
  const { PROVIDERS } = require("../payments/providers");
  const rows = await prisma.paymentProvider.findMany({ where: { storeId, enabled: true, testMode: false }, select: { provider: true } });
  const row = rows.find((r) => PROVIDERS[r.provider]);
  return row ? PROVIDERS[row.provider].name : null;
}

/** Settings when checkout can offer UPI QR: set up, and no live gateway. */
async function availableSettings(prisma, storeId) {
  const [s, gateway] = await Promise.all([activeSettings(prisma, storeId), liveGateway(prisma, storeId)]);
  return s && !gateway ? s : null;
}

/** Checkout's "UPI QR" choice (payments/service.checkoutOptions). */
async function checkoutOption(prisma, storeId) {
  if (!(await availableSettings(prisma, storeId))) return null;
  return {
    value: METHOD,
    mode: METHOD,
    testMode: false,
    gateway: null,
    title: "UPI QR",
    subtitle: "Scan a QR with Google Pay, PhonePe, Paytm or any UPI app",
    badges: ["GPay", "PhonePe", "Paytm"],
  };
}

const money = (amount) => (Math.round(Number(amount) * 100) / 100).toFixed(2);

/** upi://pay link for this amount. Only the fields every UPI app accepts
 * for a person's UPI ID (no merchant code or transaction ref, which some
 * apps refuse on personal IDs). */
function upiLink(p, store) {
  const q = new URLSearchParams({ pa: p.payeeVpa, pn: p.payeeName, am: money(p.amount), cu: p.currency || "INR", tn: `Order ${p.orderNumber} ${store.name}`.slice(0, 50) });
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}

/** The QR as an SVG, with the Oyklane mark in the middle (error
 * correction H keeps it readable with the centre covered). */
async function qrSvg(text) {
  const svg = await QRCode.toString(text, { type: "svg", errorCorrectionLevel: "H", margin: 1, color: { dark: "#111114", light: "#ffffff" } });
  const size = Number((svg.match(/viewBox="0 0 (\d+) (\d+)"/) || [])[1]) || 33;
  const box = size * 0.24;
  const at = (size - box) / 2;
  const r = box * 0.3;
  const logo =
    `<defs><linearGradient id="oyg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C5CFF"/><stop offset="1" stop-color="#2DD4BF"/></linearGradient></defs>` +
    `<rect x="${at - 0.8}" y="${at - 0.8}" width="${box + 1.6}" height="${box + 1.6}" rx="${r + 0.6}" fill="#fff"/>` +
    `<rect x="${at}" y="${at}" width="${box}" height="${box}" rx="${r}" fill="url(#oyg)"/>` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${box * 0.25}" fill="none" stroke="#fff" stroke-width="${box * 0.1}"/>`;
  return svg.replace(/<svg /, '<svg role="img" aria-label="UPI QR code" ').replace("</svg>", `${logo}</svg>`);
}

/** Checkout chose UPI QR: the order waits for its payment and a QR is made
 * for the amount due. The shopper goes to the QR page. */
async function start(prisma, store, order, amount, returnBase) {
  const s = await availableSettings(prisma, store.id);
  if (!s) throw new HttpError(400, "UPI QR isn't available for this store right now.");
  await prisma.upiPayment.upsert({
    where: { orderId: order.id },
    update: {},
    create: {
      storeId: store.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: s.autoSms ? await uniqueAmount(prisma, store.id, amount) : money(amount),
      currency: order.currency || "INR",
      payeeVpa: s.upiId,
      payeeName: s.payeeName,
      buyerName: order.shippingName || null,
      buyerEmail: order.email || null,
      buyerPhone: order.phone || null,
      expiresAt: new Date(Date.now() + s.minutes * 60_000),
    },
  });
  const root = String(returnBase || "").replace(/\/+$/, "");
  return { kind: "redirect", url: `${root}/checkout/upi?order=${encodeURIComponent(order.id)}`, ref: `upi:${order.id}` };
}

/** With bank-SMS matching, two QRs showing at once never ask for the same
 * amount: the second is a few paise less (the seller absorbs at most
 * ₹0.99), so an SMS's amount points at one order. */
async function uniqueAmount(prisma, storeId, amount) {
  const since = new Date(Date.now() - 2 * 3600_000);
  const busy = await prisma.upiPayment.findMany({ where: { storeId, status: { in: ["awaiting", "submitted", "expired"] }, createdAt: { gte: since } }, select: { amount: true } });
  const taken = new Set(busy.map((b) => money(b.amount)));
  const paise = Math.round(Number(amount) * 100);
  for (let off = 0; off < 100 && paise - off > 0; off += 1) {
    const candidate = money((paise - off) / 100);
    if (!taken.has(candidate)) return candidate;
  }
  return money(amount);
}

/** The QR for the shopper whose cart is paying for this order — no one
 * else's (the order id alone doesn't open it). */
async function forShopper(prisma, store, orderId, cartId) {
  const row = await prisma.upiPayment.findFirst({ where: { orderId: String(orderId || ""), storeId: store.id } });
  if (!row) throw new HttpError(404, "This payment wasn't found.");
  if (row.status === "awaiting" || row.status === "expired") {
    const raw = cartId ? await cartService.readRaw(prisma, store.id, cartId).catch(() => null) : null;
    if (raw?.pendingOrderId !== row.orderId) throw new HttpError(404, "This payment wasn't found.");
  }
  if (row.status === "awaiting" && row.expiresAt < new Date()) {
    return prisma.upiPayment.update({ where: { id: row.id }, data: { status: "expired" } });
  }
  return row;
}

const secondsLeft = (row) => Math.max(0, Math.round((new Date(row.expiresAt).getTime() - Date.now()) / 1000));

/** What the QR page shows (platform template "upi-pay"). */
async function pageContext(prisma, store, orderId, cartId, routes) {
  const row = await forShopper(prisma, store, orderId, cartId);
  const link = upiLink(row, store);
  const s = await activeSettings(prisma, store.id);
  return {
    auto: Boolean(s?.autoSms),
    order_id: row.orderId,
    order_number: row.orderNumber,
    amount: Number(row.amount),
    payee_name: row.payeeName,
    vpa: row.payeeVpa,
    link,
    qr: row.status === "awaiting" ? await qrSvg(link) : null,
    status: row.status,
    seconds_left: row.status === "awaiting" ? secondsLeft(row) : 0,
    minutes: s?.minutes || DEFAULT_MINUTES,
    action_url: `${routes.checkout_url}/upi`,
    status_url: `${routes.checkout_url}/upi/status?order=${encodeURIComponent(row.orderId)}`,
    done_url: `${routes.checkout_url}/confirmation?order=${encodeURIComponent(row.orderId)}`,
    checkout_url: routes.checkout_url,
  };
}

/** For the QR page's watcher: has it been paid, reported or timed out? */
async function shopperStatus(prisma, store, orderId, cartId) {
  const row = await forShopper(prisma, store, orderId, cartId);
  const order = await prisma.order.findUnique({ where: { id: row.orderId }, select: { paymentStatus: true } });
  return { status: order?.paymentStatus === "paid" ? "confirmed" : row.status, secondsLeft: row.status === "awaiting" ? secondsLeft(row) : 0 };
}

/** The timer ran out before paying: a fresh QR (same order, same amount). */
async function renew(prisma, store, orderId, cartId) {
  const row = await forShopper(prisma, store, orderId, cartId);
  if (row.status !== "awaiting" && row.status !== "expired") return row;
  const s = (await activeSettings(prisma, store.id)) || { minutes: DEFAULT_MINUTES };
  return prisma.upiPayment.update({ where: { id: row.id }, data: { status: "awaiting", expiresAt: new Date(Date.now() + s.minutes * 60_000), attempts: { increment: 1 } } });
}

const adminUrl = (row) => `${env.ADMIN_ORIGIN.replace(/\/$/, "")}/admin/apps/upi-qr?payment=${row.id}`;

// On the order while a reported payment waits for the seller (a reference
// makes it an order the store has — orders/placed.js).
const REPORTED = "UPI — reported by customer";

/** "I've paid": the shopper may give the UPI reference. The order is
 * placed (payment to check), the cart is done, and the seller is asked to
 * check. */
async function submit(prisma, store, orderId, cartId, utrInput, { log } = {}) {
  const utr = utrSchema.parse(utrInput) || null;
  const row = await forShopper(prisma, store, orderId, cartId);
  if (row.status === "submitted" || row.status === "confirmed") return row;
  if (row.status === "rejected") throw new HttpError(400, "This payment was declined by the store. Please contact them.");
  if (utr) {
    const reused = await prisma.upiPayment.findFirst({ where: { storeId: store.id, utr, id: { not: row.id }, status: { in: ["submitted", "confirmed"] } }, select: { id: true } });
    if (reused) throw new HttpError(400, "That UPI reference was already used for another order. Check the number in your UPI app.");
  }
  const updated = await prisma.upiPayment.update({ where: { id: row.id }, data: { status: "submitted", utr, submittedAt: new Date() } });
  await prisma.order.update({ where: { id: row.orderId }, data: { paymentReference: utr || REPORTED } });
  await addOrderEvent(prisma, row.orderId, {
    kind: "payment",
    message: `Customer says they paid ${money(row.amount)} by UPI to ${row.payeeVpa}${utr ? ` (reference ${utr})` : ""} — check it arrived, then confirm in Apps ▸ UPI QR`,
  });
  if (cartId) await cartService.clearCart(prisma, store.id, cartId).catch(() => {});
  const order = await prisma.order.findUnique({ where: { id: row.orderId }, include: { customer: true, items: true } });
  await notify.sendOrderPlaced(prisma, store, order, log).catch((err) => log?.error({ err }, "upi: order emails failed"));
  try {
    const alert = templates.upiPaymentAlert({ store, payment: updated, adminUrl: adminUrl(updated) });
    for (const inbox of await storeInboxes(prisma, store)) {
      await sendEmail(prisma, { to: inbox, ...alert, template: "upi_payment_alert", storeId: store.id, refType: "order", refId: row.orderId, log });
    }
  } catch (err) {
    log?.warn({ err }, "upi: seller alert failed");
  }
  return updated;
}

// ── Seller side (Apps ▸ UPI QR) ────────────────────────────────────

async function overview(prisma, storeId, { status = "submitted", q, page = 1 } = {}) {
  const row = await installed(prisma, storeId);
  if (!row) throw new HttpError(404, "Install the UPI QR app first.");
  const where = { storeId, ...(status !== "all" && { status }) };
  const term = String(q || "").trim();
  if (term) where.OR = ["utr", "buyerName", "buyerEmail", "buyerPhone"].map((f) => ({ [f]: { contains: term, mode: "insensitive" } }));
  const since = new Date(Date.now() - 30 * 86400_000);
  const [payments, total, byStatus, recent] = await Promise.all([
    prisma.upiPayment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.upiPayment.count({ where }),
    prisma.upiPayment.groupBy({ by: ["status"], where: { storeId }, _count: { _all: true } }),
    prisma.upiPayment.findMany({ where: { storeId, createdAt: { gte: since } }, select: { status: true, amount: true, createdAt: true, submittedAt: true, decidedAt: true } }),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
  const confirmed = recent.filter((r) => r.status === "confirmed");
  const timed = recent.filter((r) => r.submittedAt).map((r) => (new Date(r.submittedAt) - new Date(r.createdAt)) / 1000);
  const { smsToken, ...settings } = readSettings(row);
  return {
    settings: { ...settings, smsUrl: smsToken ? smsUrl(smsToken) : null },
    hiddenBy: await liveGateway(prisma, storeId),
    stats: {
      collected30: confirmed.reduce((sum, r) => sum + Number(r.amount), 0),
      confirmed30: confirmed.length,
      started30: recent.length,
      // Of the QRs shown in 30 days, how many ended in a confirmed payment.
      conversion30: recent.length ? Math.round((confirmed.length / recent.length) * 100) : null,
      // How long shoppers took from seeing the QR to reporting the payment.
      medianSecondsToPay: timed.length ? timed.sort((a, b) => a - b)[Math.floor(timed.length / 2)] : null,
      toCheck: counts.submitted || 0,
    },
    counts,
    payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

async function saveSettings(prisma, storeId, input) {
  const row = await installed(prisma, storeId);
  if (!row) throw new HttpError(404, "Install the UPI QR app first.");
  const s = settingsSchema.parse(input || {});
  await prisma.storeApp.update({ where: { id: row.id }, data: { settings: { ...(row.settings || {}), ...s } } });
  return s;
}

const smsUrl = (token) => `${env.API_PUBLIC_URL.replace(/\/$/, "")}/api/public/upi-sms/${token}`;

/** Bank-SMS matching on or off. Turning it on makes the store's secret
 * link (a new one each time — the old link stops working). */
async function setAutoSms(prisma, storeId, on) {
  const row = await installed(prisma, storeId);
  if (!row) throw new HttpError(404, "Install the UPI QR app first.");
  const current = (row.settings && typeof row.settings === "object" && row.settings) || {};
  const next = on ? { ...current, autoSms: true, smsToken: crypto.randomBytes(18).toString("hex"), lastSms: null } : { ...current, autoSms: false, smsToken: null };
  await prisma.storeApp.update({ where: { id: row.id }, data: { settings: next } });
  return { autoSms: next.autoSms, smsUrl: next.smsToken ? smsUrl(next.smsToken) : null };
}

/**
 * What a bank SMS says: a credit, its amount and the UPI reference.
 * Indian banks word these many ways — "Rs.239.00 credited to a/c XX12 …
 * UPI Ref 123456789012", "INR 239 received from …", "Your A/c is credited
 * with ₹239.00 … (UPI Ref No 1234…)". Debits and OTPs are ignored.
 */
function parseBankSms(text) {
  const t = String(text || "").replace(/\s+/g, " ").slice(0, 1000);
  if (!/credit|received|deposited|\bcr\b|added to/i.test(t)) return null;
  // A debit SMS can also say "credited to <payee>" — never one of ours.
  if (/debited|\bdr\.?\s|\bOTP\b|spent|withdrawn|sent to|paid to|debit/i.test(t)) return null;
  const m = t.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) return null;
  const amount = Number(m[1].replace(/,/g, ""));
  if (!(amount > 0)) return null;
  const ref = (t.match(/(?:upi|ref|rrn|utr)[^\d]{0,20}(\d{12})/i) || t.match(/\b(\d{12})\b/) || [])[1] || null;
  return { amount: money(amount), ref };
}

/** The text of a forwarded SMS — forwarder apps post it as JSON under
 * one of several names, as a form, or as plain text. */
function smsText(body) {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return "";
  for (const k of ["text", "message", "msg", "body", "content", "sms", "smsText", "Body"]) if (typeof body[k] === "string") return body[k];
  return JSON.stringify(body);
}

/**
 * A forwarded bank SMS (POST /api/public/upi-sms/:token). The payment it
 * pays is the one QR in the last two hours asking for that exact amount
 * (or with that UPI reference); it's confirmed as if the seller pressed
 * Received. Anything else is noted for the seller and ignored.
 */
async function receiveSms(prisma, token, body, { log } = {}) {
  if (!/^[a-f0-9]{36}$/.test(String(token || ""))) throw new HttpError(404, "Not found");
  const row = await prisma.storeApp.findFirst({ where: { app: { key: APP_KEY }, settings: { path: ["smsToken"], equals: token } }, select: { id: true, storeId: true, settings: true } });
  if (!row || !row.settings?.autoSms) throw new HttpError(404, "Not found");
  const note = async (ok, text) => {
    await prisma.storeApp.update({ where: { id: row.id }, data: { settings: { ...row.settings, lastSms: { at: new Date().toISOString(), ok, note: text } } } }).catch(() => {});
    return { ok, note: text };
  };
  const sms = parseBankSms(smsText(body));
  if (!sms) return note(false, "Got a message, but it isn't a bank credit SMS with an amount — ignored.");
  const since = new Date(Date.now() - 2 * 3600_000);
  const open = { storeId: row.storeId, status: { in: ["awaiting", "submitted", "expired"] }, createdAt: { gte: since } };
  let matches = sms.ref ? await prisma.upiPayment.findMany({ where: { ...open, utr: sms.ref } }) : [];
  if (!matches.length) matches = await prisma.upiPayment.findMany({ where: { ...open, amount: sms.amount }, orderBy: { createdAt: "desc" } });
  if (sms.ref) {
    const done = await prisma.upiPayment.findFirst({ where: { storeId: row.storeId, status: "confirmed", utr: sms.ref }, select: { orderNumber: true } });
    if (done) return note(true, `₹${sms.amount} (ref ${sms.ref}) was already confirmed for order #${done.orderNumber}.`);
  }
  if (!matches.length) return note(false, `₹${sms.amount} credited, but no QR in the last 2 hours asked for that amount — check it yourself.`);
  if (matches.length > 1) return note(false, `₹${sms.amount} credited, but ${matches.length} orders asked for that amount — confirm the right one yourself.`);
  const payment = matches[0];
  const store = await prisma.store.findUnique({ where: { id: row.storeId } });
  if (sms.ref && !payment.utr) await prisma.upiPayment.update({ where: { id: payment.id }, data: { utr: sms.ref } }).catch(() => {});
  await confirm(prisma, store, payment.id, { by: "Bank SMS (automatic)", log });
  return note(true, `₹${sms.amount} matched order #${payment.orderNumber} — confirmed.`);
}

/** A sample QR for the settings page (₹1, so a test scan costs nothing much). */
async function preview(prisma, store) {
  const s = await activeSettings(prisma, store.id);
  if (!s) return null;
  return qrSvg(upiLink({ payeeVpa: s.upiId, payeeName: s.payeeName, amount: 1, currency: "INR", orderNumber: "TEST" }, store));
}

async function findForSeller(prisma, storeId, id) {
  const row = await prisma.upiPayment.findFirst({ where: { id, storeId } });
  if (!row) throw new HttpError(404, "Payment not found");
  return row;
}

/** The money arrived: the order is paid (emails and webhooks as for any
 * online payment). Works from "awaiting" too — a shopper who paid but
 * closed the page before reporting it. */
async function confirm(prisma, store, id, { by, log } = {}) {
  const row = await findForSeller(prisma, store.id, id);
  if (row.status === "confirmed") return row;
  if (row.status === "rejected") throw new HttpError(400, "This payment was marked as not received.");
  const order = await prisma.order.findUnique({ where: { id: row.orderId } });
  if (!order) throw new HttpError(404, "The order for this payment no longer exists.");
  // Lazy: checkout/service requires this module.
  const { markOnlinePaid } = require("../checkout/service");
  const fresh = await prisma.upiPayment.findUnique({ where: { id: row.id }, select: { utr: true } });
  await markOnlinePaid(prisma, order, { providerName: "UPI", reference: fresh?.utr || `to ${row.payeeVpa}`, log });
  // Paid without being reported: the shopper's cart is still waiting on it.
  await prisma.cartSession.deleteMany({ where: { storeId: store.id, data: { path: ["pendingOrderId"], equals: order.id } } }).catch(() => {});
  return prisma.upiPayment.update({ where: { id: row.id }, data: { status: "confirmed", decidedAt: new Date(), decidedBy: by || null } });
}

/** The money never came: the order is cancelled (stock back, the
 * shopper told). */
async function reject(prisma, store, id, { by, actorName, log } = {}) {
  const row = await findForSeller(prisma, store.id, id);
  if (row.status !== "submitted") throw new HttpError(400, "Only a payment the customer reported can be marked as not received.");
  await cancelOrder(prisma, store, row.orderId, { reason: "UPI payment not received", restock: true, refund: false, notify: true }, { actorName, log });
  return prisma.upiPayment.update({ where: { id: row.id }, data: { status: "rejected", decidedAt: new Date(), decidedBy: by || null } });
}

module.exports = { APP_KEY, METHOD, checkoutOption, activeSettings, availableSettings, liveGateway, setAutoSms, receiveSms, parseBankSms, start, pageContext, shopperStatus, renew, submit, overview, saveSettings, preview, confirm, reject };
