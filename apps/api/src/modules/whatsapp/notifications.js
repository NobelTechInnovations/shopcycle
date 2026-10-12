const { toE164 } = require("../../lib/phone");
const { formatCurrency } = require("@shopcycle/utils");
const webhooks = require("../developer/webhooks");
const { PROVIDER_KEYS } = require("../orders/placed");
const { addOrderEvent } = require("../orders/events");
const notify = require("../orders/notify");
const repository = require("../meta/repository");
const standard = require("./standard-templates");
const platform = require("./platform");
const service = require("./service");

/**
 * Order updates on WhatsApp — confirmed, shipped, delivered — using
 * Oyklane's standard templates. Who sends:
 *
 *   the store's own number   when it's connected and its copy of the
 *                            template is approved (sender "auto" or "own")
 *   Oyklane's shared number  otherwise (sender "auto" or "platform")
 *
 * Whether a store sends at all: its own switch (WhatsApp ▸ Settings ▸
 * Order updates) or, until it sets one, Oyklane's default (Super admin ▸
 * Messaging). One message per order and kind, ever — repeats and retries
 * of the same event are claimed away.
 */

const EVENT_KIND = {};
for (const [kind, k] of Object.entries(standard.KINDS)) for (const e of k.events) EVENT_KIND[e] = kind;

function storeSettings(store) {
  return store?.settings?.whatsapp?.notifications || {};
}

/** On or off for this store and kind, and which sender it prefers. */
async function decide(prisma, store, kind) {
  const own = storeSettings(store);
  const def = (await platform.load(prisma)).notifications || {};
  const enabled = own[kind] !== undefined ? Boolean(own[kind]) : Boolean(def.enabled && def.events?.[kind] !== false);
  return { enabled, sender: ["own", "platform"].includes(own.sender) ? own.sender : "auto" };
}

/** The sender and its approved template for one kind, or why not. */
async function pickSender(prisma, store, kind, sender) {
  const name = standard.KINDS[kind].name;
  if (sender !== "platform") {
    const conn = await repository.findByStore(prisma, store.id);
    if (conn?.phoneNumberId && conn.wabaId) {
      const tpl = (await service.templates(prisma, store, { conn }).catch(() => [])).find((t) => t.name === name && t.status === "APPROVED");
      if (tpl) return { conn, tpl, linkMode: "store" };
      if (sender === "own") return { reason: `Your WhatsApp account has no approved "${name}" template yet` };
    } else if (sender === "own") {
      return { reason: "Your own WhatsApp number isn't connected" };
    }
  }
  const pconn = await platform.connection(prisma);
  if (!pconn) return { reason: "Oyklane's WhatsApp number isn't set up" };
  const tpl = (await service.templates(prisma, store, { conn: pconn }).catch(() => [])).find((t) => t.name === name && t.status === "APPROVED");
  if (!tpl) return { reason: `Oyklane's "${name}" template isn't approved yet` };
  return { conn: pconn, tpl, linkMode: "platform" };
}

const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "there";

async function send(prisma, storeId, kind, orderId, { log } = {}) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.status !== "active") return { skipped: "store inactive" };
  const { enabled, sender } = await decide(prisma, store, kind);
  if (!enabled) return { skipped: "off" };
  const order = await prisma.order.findFirst({ where: { id: orderId, storeId }, include: { customer: true, fulfillments: { orderBy: { createdAt: "desc" } } } });
  if (!order || order.cancelledAt) return { skipped: "no order" };
  const phone = toE164(order.phone || order.customer?.phone);
  if (!phone) return { skipped: "no phone" };
  if (await service.optedOut(prisma, store.id, phone)) return { skipped: "opted out" };
  const pick = await pickSender(prisma, store, kind, sender);
  if (!pick.conn) {
    log?.info({ storeId, kind, reason: pick.reason }, "whatsapp order update not sent");
    return { skipped: pick.reason };
  }
  const shipment = order.fulfillments.find((f) => f.status !== "cancelled");
  const values = {
    "customer.first_name": firstName(order.shippingName || order.customer?.name),
    "order.number": `#${order.orderNumber}`,
    "store.name": store.name,
    "order.total": formatCurrency(Number(order.total), order.currency || store.currency || "INR"),
    "order.courier": shipment?.courier || "our delivery partner",
  };
  const body = standard.KINDS[kind].vars.map((v) => values[v]);
  // The button: the order page — the store's own link on its own account,
  // Oyklane's redirect (api.oyklane.com/o/<code>) on the shared one.
  const statusUrl = await notify.statusUrlFor(prisma, store, order);
  const token = statusUrl.split("/orders/").pop();
  const buttonUrl = token;
  try {
    const res = await service.deliver(prisma, store, {
      conn: pick.conn,
      phone,
      dedupeKey: `notify:${kind}:${order.id}`,
      payload: { type: "template", template: { name: pick.tpl.name, language: { code: pick.tpl.language }, components: service.templateComponents(pick.tpl, { body, buttonUrl }) } },
      record: { kind: "template", messageType: "template", templateName: pick.tpl.name, templateLanguage: pick.tpl.language, body: service.renderTemplateText(pick.tpl, body), source: "notification", customerId: order.customerId || null },
    });
    if (res.duplicate) return { skipped: "already sent" };
    await addOrderEvent(prisma, order.id, { kind: "whatsapp", message: `WhatsApp "${standard.KINDS[kind].label}" sent to +${phone}${pick.conn.platform ? " from Oyklane's number" : ""}`, meta: { template: pick.tpl.name } }).catch(() => {});
    return { sent: true, from: pick.conn.platform ? "platform" : "store" };
  } catch (err) {
    log?.warn({ err, storeId, kind }, "whatsapp order update failed");
    await addOrderEvent(prisma, order.id, { kind: "whatsapp", message: `WhatsApp "${standard.KINDS[kind].label}" couldn't be sent: ${err.message}` }).catch(() => {});
    return { failed: err.message };
  }
}

async function onEvent(prisma, storeId, event, subject, { log } = {}) {
  const kind = EVENT_KIND[event];
  if (!kind || !subject?.id) return null;
  if (kind === "orderConfirmed") {
    // Same rule as Flows: an online order waiting for payment isn't confirmed yet.
    const o = await prisma.order.findFirst({ where: { id: subject.id, storeId }, select: { paymentMethod: true, paymentStatus: true, paymentReference: true } });
    if (!o) return null;
    const pending = (PROVIDER_KEYS.includes(o.paymentMethod) || o.paymentMethod === "upi_qr") && o.paymentStatus === "pending" && !(o.paymentMethod === "upi_qr" && o.paymentReference);
    if (pending) return null;
  }
  return send(prisma, storeId, kind, subject.id, { log });
}

let registered = false;
function register(log) {
  if (registered) return;
  registered = true;
  webhooks.onEvent((prisma, storeId, event, subject) => onEvent(prisma, storeId, event, subject, { log }));
}

module.exports = { register, onEvent, send, decide, pickSender, storeSettings };
