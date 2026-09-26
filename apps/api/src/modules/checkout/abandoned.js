const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { sendEmail } = require("../../lib/mailer");
const { storefrontUrl } = require("../../lib/storefront-url");
const { storeSettings } = require("../../lib/store-settings");
const { computeAccessState, isStorefrontBlocked } = require("../billing/access");
const templates = require("../../emails/templates");
const cartService = require("../cart/service");

/**
 * Abandoned checkouts. A cart becomes a "checkout" once the shopper
 * reaches checkout and we learn who they are — they type their email
 * (captured as they leave the field) or they're signed in. If no order
 * follows within the store's delay (an hour by default), they get ONE
 * reminder with a link that restores the cart on any device. Placing an
 * order deletes the cart row, so whatever is left is abandoned.
 */

const DEFAULT_DELAY_MINUTES = 60;
const MAX_AGE_DAYS = 3; // never remind about checkouts older than this

async function captureContact(prisma, store, { cartId, email, name }) {
  if (!cartId) return { captured: false };
  const row = await prisma.cartSession.findUnique({ where: { storeId_cartId: { storeId: store.id, cartId } } });
  const items = Array.isArray(row?.data?.items) ? row.data.items : [];
  if (!row || row.expiresAt < new Date() || items.length === 0) return { captured: false };

  await prisma.cartSession.update({
    where: { storeId_cartId: { storeId: store.id, cartId } },
    data: {
      email: String(email).trim().toLowerCase(),
      ...(name && { customerName: String(name).trim().slice(0, 120) }),
      checkoutStartedAt: row.checkoutStartedAt || new Date(),
      recoveryToken: row.recoveryToken || crypto.randomBytes(18).toString("base64url"),
    },
  });
  return { captured: true };
}

/** The cart a reminder link points at. Marks it recovered and returns its
 * id, which the storefront puts back in the shopper's cart cookie. */
async function recoverCart(prisma, store, token) {
  if (!token || typeof token !== "string" || token.length > 100) throw new HttpError(404, "This link has expired.");
  const row = await prisma.cartSession.findFirst({ where: { storeId: store.id, recoveryToken: token } });
  if (!row || row.expiresAt < new Date()) throw new HttpError(404, "This cart has expired — the items may still be in the store.");
  await prisma.cartSession.update({
    where: { storeId_cartId: { storeId: store.id, cartId: row.cartId } },
    data: { recoveredAt: row.recoveredAt || new Date() },
  });
  return { cartId: row.cartId };
}

async function listAbandonedCheckouts(prisma, store, { page = 1, pageSize = 20 }) {
  const where = { storeId: store.id, checkoutStartedAt: { not: null }, email: { not: null }, expiresAt: { gt: new Date() } };
  const [rows, total] = await Promise.all([
    prisma.cartSession.findMany({ where, orderBy: { checkoutStartedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.cartSession.count({ where }),
  ]);
  const checkouts = [];
  for (const row of rows) {
    const cart = await cartService.hydrateCart(prisma, store.id, row.cartId, {
      items: Array.isArray(row.data?.items) ? row.data.items : [],
      discountCode: row.data?.discountCode || null,
    });
    checkouts.push({
      id: row.cartId,
      email: row.email,
      name: row.customerName,
      startedAt: row.checkoutStartedAt,
      updatedAt: row.updatedAt,
      reminderSentAt: row.reminderSentAt,
      recoveredAt: row.recoveredAt,
      itemCount: cart.item_count,
      items: cart.items.map((i) => ({ title: i.title, quantity: i.quantity, image: i.image, lineTotal: i.lineTotal })),
      subtotal: cart.subtotal,
      total: cart.total,
      recoveryUrl: row.recoveryToken ? storefrontUrl(store, `/cart/recover/${row.recoveryToken}`) : null,
    });
  }
  return { checkouts, total, page, pageSize };
}

/**
 * One pass of the reminder job (jobs.js runs it every few minutes). Each
 * cart is claimed with an atomic update before its email goes out, so two
 * API processes running the job at once can't both send it.
 */
async function sweepAbandonedCheckouts(prisma, { delayMinutes = DEFAULT_DELAY_MINUTES, log } = {}) {
  const now = Date.now();
  const candidates = await prisma.cartSession.findMany({
    where: {
      reminderSentAt: null,
      email: { not: null },
      expiresAt: { gt: new Date(now) },
      checkoutStartedAt: { lte: new Date(now - delayMinutes * 60 * 1000), gte: new Date(now - MAX_AGE_DAYS * 24 * 60 * 60 * 1000) },
    },
    include: { store: true },
    take: 100,
  });

  let sent = 0;
  for (const row of candidates) {
    const { count } = await prisma.cartSession.updateMany({
      where: { storeId: row.storeId, cartId: row.cartId, reminderSentAt: null },
      data: { reminderSentAt: new Date() },
    });
    if (count !== 1) continue;

    const store = row.store;
    if (!storeSettings(store).notifications.abandonedCheckout) continue;
    if (store.status !== "active" || isStorefrontBlocked(computeAccessState(store))) continue;
    // They may have ordered with a different cart since — don't nag.
    const ordered = await prisma.order.findFirst({
      where: { storeId: store.id, email: { equals: row.email, mode: "insensitive" }, createdAt: { gte: row.checkoutStartedAt } },
      select: { id: true },
    });
    if (ordered) continue;

    const cart = await cartService.hydrateCart(prisma, store.id, row.cartId, {
      items: Array.isArray(row.data?.items) ? row.data.items : [],
      discountCode: row.data?.discountCode || null,
    });
    if (!cart.items.length) continue;

    const { subject, html } = templates.abandonedCheckout({
      store,
      cart,
      customerName: row.customerName,
      recoverUrl: storefrontUrl(store, `/cart/recover/${row.recoveryToken}`),
    });
    const result = await sendEmail(prisma, {
      to: row.email,
      subject,
      html,
      template: "abandoned_checkout",
      storeId: store.id,
      fromName: store.name,
      replyTo: store.supportEmail || undefined,
      refType: "cart",
      refId: row.cartId,
      log,
    });
    if (result.status !== "failed") sent += 1;
  }
  return { checked: candidates.length, sent };
}

module.exports = { captureContact, recoverCart, listAbandonedCheckouts, sweepAbandonedCheckouts, DEFAULT_DELAY_MINUTES };
