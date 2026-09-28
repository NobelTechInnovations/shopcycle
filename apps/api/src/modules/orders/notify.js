const crypto = require("crypto");
const { env } = require("../../config/env");
const { sendEmail } = require("../../lib/mailer");
const { storefrontUrl } = require("../../lib/storefront-url");
const { storeSettings } = require("../../lib/store-settings");
const templates = require("../../emails/templates");
const { addOrderEvent } = require("./events");

/**
 * Emails about an order — to the shopper (on the store's behalf) and to
 * the store. Each send is logged on the order's timeline, so the merchant
 * can see exactly what the customer was told and when.
 */

/** The order's status-page key, minted the first time anything links to
 * it. The `statusToken: null` condition keeps two concurrent callers from
 * minting two different links. */
async function ensureStatusToken(prisma, order) {
  if (order.statusToken) return order.statusToken;
  const token = crypto.randomBytes(18).toString("base64url");
  await prisma.order.updateMany({ where: { id: order.id, statusToken: null }, data: { statusToken: token } });
  const fresh = await prisma.order.findUnique({ where: { id: order.id }, select: { statusToken: true } });
  order.statusToken = fresh.statusToken;
  return fresh.statusToken;
}

async function statusUrlFor(prisma, store, order) {
  return storefrontUrl(store, `/orders/${await ensureStatusToken(prisma, order)}`);
}

/** Where a store's own alerts go: the owner's login email — the inbox the
 * seller certainly reads — and the store's support address too, if it has a
 * different one. */
async function storeInboxes(prisma, store) {
  const owner = await prisma.storeUser.findFirst({
    where: { storeId: store.id, role: "owner" },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
  });
  const all = [owner?.user?.email, store.supportEmail].filter(Boolean).map((e) => e.trim().toLowerCase());
  return [...new Set(all)];
}

async function sendToShopper(prisma, store, order, { template, subject, html, log }) {
  const to = order.email || order.customer?.email;
  if (!to) return null;
  const result = await sendEmail(prisma, {
    to,
    subject,
    html,
    template,
    storeId: store.id,
    fromName: store.name,
    replyTo: store.supportEmail || undefined,
    refType: "order",
    refId: order.id,
    log,
  });
  await addOrderEvent(prisma, order.id, {
    kind: "email",
    message: result.status === "failed" ? `Couldn't send "${subject}" to ${to}` : `Emailed "${subject}" to ${to}`,
    meta: { template, emailLogId: result.id, status: result.status },
  });
  return result;
}

/** Order confirmation + the store's new-order alert — once per order, no
 * matter how many paths call it (COD checkout, payment verified, a retried
 * callback). The atomic claim on confirmationSentAt is what makes it once. */
async function sendOrderPlaced(prisma, store, order, log) {
  const { count } = await prisma.order.updateMany({
    where: { id: order.id, confirmationSentAt: null },
    data: { confirmationSentAt: new Date() },
  });
  if (count === 0) return;

  const statusUrl = await statusUrlFor(prisma, store, order);
  const confirmation = templates.orderConfirmation({ store, order, statusUrl });
  await sendToShopper(prisma, store, order, { template: "order_confirmation", ...confirmation, log });

  if (storeSettings(store).notifications.newOrderAlert) {
    const alert = templates.newOrderAlert({
      store,
      order,
      adminUrl: `${env.ADMIN_ORIGIN.replace(/\/$/, "")}/admin/orders/${order.id}`,
    });
    for (const inbox of await storeInboxes(prisma, store)) {
      await sendEmail(prisma, { to: inbox, ...alert, template: "new_order_alert", storeId: store.id, refType: "order", refId: order.id, log });
    }
  }
}

async function resendOrderConfirmation(prisma, store, order, log) {
  const statusUrl = await statusUrlFor(prisma, store, order);
  const confirmation = templates.orderConfirmation({ store, order, statusUrl });
  return sendToShopper(prisma, store, order, { template: "order_confirmation", ...confirmation, log });
}

async function sendShippingUpdate(prisma, store, order, fulfillment, log) {
  const statusUrl = await statusUrlFor(prisma, store, order);
  const itemsById = Object.fromEntries(order.items.map((i) => [i.id, i]));
  const lineItems = (fulfillment.items || [])
    .map((f) => itemsById[f.orderItemId] && { ...itemsById[f.orderItemId], quantity: f.quantity, total: Number(itemsById[f.orderItemId].price) * f.quantity })
    .filter(Boolean);
  const email = templates.shippingUpdate({ store, order, fulfillment: { ...fulfillment, lineItems }, statusUrl });
  return sendToShopper(prisma, store, order, { template: "shipping_update", ...email, log });
}

async function sendDelivered(prisma, store, order, log) {
  const email = templates.orderDelivered({ store, order, statusUrl: await statusUrlFor(prisma, store, order) });
  return sendToShopper(prisma, store, order, { template: "order_delivered", ...email, log });
}

async function sendCancelled(prisma, store, order, reason, log) {
  const email = templates.orderCancelled({ store, order, reason, statusUrl: await statusUrlFor(prisma, store, order) });
  return sendToShopper(prisma, store, order, { template: "order_cancelled", ...email, log });
}

async function sendRefund(prisma, store, order, refund, log) {
  const email = templates.refundIssued({ store, order, refund, statusUrl: await statusUrlFor(prisma, store, order) });
  return sendToShopper(prisma, store, order, { template: "refund_issued", ...email, log });
}

async function sendReturnUpdate(prisma, store, order, returnRequest, log) {
  const email = templates.returnUpdate({ store, order, returnRequest, statusUrl: await statusUrlFor(prisma, store, order) });
  return sendToShopper(prisma, store, order, { template: "return_update", ...email, log });
}

module.exports = {
  ensureStatusToken,
  statusUrlFor,
  storeInboxes,
  sendOrderPlaced,
  resendOrderConfirmation,
  sendShippingUpdate,
  sendDelivered,
  sendCancelled,
  sendRefund,
  sendReturnUpdate,
};
