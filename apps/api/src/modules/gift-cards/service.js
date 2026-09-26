const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { sendEmail } = require("../../lib/mailer");
const { storefrontUrl } = require("../../lib/storefront-url");
const templates = require("../../emails/templates");

/**
 * Store gift cards. A code is 16 characters (about 80 bits of randomness,
 * no look-alike letters), shown in full only when issued and in the
 * recipient's email; the database keeps a SHA-256 of it and the last 4.
 * Every balance change is a GiftCardTransaction, written in the same
 * transaction as the change.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function generateCode() {
  const bytes = crypto.randomBytes(16);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return chars.match(/.{4}/g).join("-");
}

const normalizeCode = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function hashCode(storeId, code) {
  return crypto.createHash("sha256").update(`${storeId}:${normalizeCode(code)}`).digest("hex");
}

function publicCard(card) {
  return {
    id: card.id,
    last4: card.last4,
    initialValue: Number(card.initialValue),
    balance: Number(card.balance),
    currency: card.currency,
    status: card.status,
    expiresAt: card.expiresAt,
    recipientName: card.recipientName,
    recipientEmail: card.recipientEmail,
    note: card.note,
    createdBy: card.createdBy,
    createdAt: card.createdAt,
  };
}

/** Why a card can't be used right now, or null if it can. */
function unusableReason(card) {
  if (!card) return "That gift card code isn't valid.";
  if (card.status !== "active") return "This gift card has been disabled.";
  if (card.expiresAt && card.expiresAt < new Date()) return "This gift card has expired.";
  if (Number(card.balance) <= 0) return "This gift card has no balance left.";
  return null;
}

async function findByCode(prisma, storeId, code) {
  if (normalizeCode(code).length !== 16) return null;
  return prisma.giftCard.findFirst({ where: { storeId, codeHash: hashCode(storeId, code) } });
}

async function issue(prisma, store, input, { actorName, log } = {}) {
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new HttpError(400, "Enter an amount.");
  let code;
  let card;
  // A collision in ~80 bits won't happen in practice; the unique index is
  // the backstop, and we retry rather than fail.
  for (let attempt = 0; attempt < 3 && !card; attempt += 1) {
    code = generateCode();
    try {
      card = await prisma.$transaction(async (tx) => {
        const created = await tx.giftCard.create({
          data: {
            storeId: store.id,
            codeHash: hashCode(store.id, code),
            last4: normalizeCode(code).slice(-4),
            initialValue: amount,
            balance: amount,
            currency: store.currency,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            recipientName: input.recipientName || null,
            recipientEmail: input.recipientEmail ? String(input.recipientEmail).toLowerCase() : null,
            note: input.note || null,
            createdBy: actorName || null,
          },
        });
        await tx.giftCardTransaction.create({ data: { giftCardId: created.id, amount, kind: "issued", note: input.note || null, actorName } });
        return created;
      });
    } catch (err) {
      if (err.code !== "P2002") throw err;
    }
  }
  if (!card) throw new HttpError(503, "Couldn't create a gift card just now — please try again.");

  let emailed = null;
  if (input.sendEmail && card.recipientEmail) {
    const email = templates.giftCardIssued({
      store,
      code,
      amount,
      recipientName: card.recipientName,
      message: input.message,
      expiresAt: card.expiresAt,
      shopUrl: storefrontUrl(store, "/"),
    });
    const result = await sendEmail(prisma, {
      to: card.recipientEmail,
      ...email,
      template: "gift_card",
      storeId: store.id,
      fromName: store.name,
      replyTo: store.supportEmail || undefined,
      refType: "gift_card",
      refId: card.id,
      log,
    });
    emailed = result.status;
  }
  return { card: publicCard(card), code, emailed };
}

async function list(prisma, storeId, { q, status, page = 1, pageSize = 25 }) {
  const needle = normalizeCode(q);
  const where = {
    storeId,
    ...(status && status !== "all" && { status }),
    ...(q && {
      OR: [
        { recipientEmail: { contains: q, mode: "insensitive" } },
        { recipientName: { contains: q, mode: "insensitive" } },
        ...(needle.length >= 4 ? [{ last4: needle.slice(-4) }] : []),
      ],
    }),
  };
  const [cards, total, outstanding] = await Promise.all([
    prisma.giftCard.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.giftCard.count({ where }),
    prisma.giftCard.aggregate({ where: { storeId, status: "active" }, _sum: { balance: true } }),
  ]);
  return { giftCards: cards.map(publicCard), total, outstanding: Number(outstanding._sum.balance || 0) };
}

async function get(prisma, storeId, id) {
  const card = await prisma.giftCard.findFirst({ where: { id, storeId }, include: { transactions: { orderBy: { createdAt: "desc" } } } });
  if (!card) throw new HttpError(404, "Gift card not found");
  const orderIds = [...new Set(card.transactions.map((t) => t.orderId).filter(Boolean))];
  const orders = orderIds.length ? await prisma.order.findMany({ where: { id: { in: orderIds }, storeId }, select: { id: true, orderNumber: true } }) : [];
  const numbers = Object.fromEntries(orders.map((o) => [o.id, o.orderNumber]));
  return {
    ...publicCard(card),
    transactions: card.transactions.map((t) => ({ ...t, amount: Number(t.amount), orderNumber: t.orderId ? numbers[t.orderId] || null : null })),
  };
}

async function update(prisma, storeId, id, input, { actorName } = {}) {
  const card = await prisma.giftCard.findFirst({ where: { id, storeId } });
  if (!card) throw new HttpError(404, "Gift card not found");
  return prisma.$transaction(async (tx) => {
    const data = {};
    if (input.status) data.status = input.status;
    if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (input.adjustment) {
      const delta = round2(input.adjustment);
      if (Number(card.balance) + delta < 0) throw new HttpError(400, "The balance can't go below zero.");
      data.balance = { increment: delta };
      await tx.giftCardTransaction.create({ data: { giftCardId: id, amount: delta, kind: "adjusted", note: input.note || null, actorName } });
    }
    const updated = await tx.giftCard.update({ where: { id }, data });
    return publicCard(updated);
  });
}

/**
 * Takes `amount` off the card as part of placing an order. Conditional on
 * the balance still covering it, so two orders can't spend the same money;
 * throws if it doesn't (the checkout then fails and nothing is charged).
 */
async function redeem(tx, card, orderId, amount) {
  const value = round2(amount);
  if (!(value > 0)) return;
  const { count } = await tx.giftCard.updateMany({
    where: { id: card.id, status: "active", balance: { gte: value } },
    data: { balance: { decrement: value } },
  });
  if (count !== 1) throw new HttpError(409, "Your gift card balance changed. Please review your cart and try again.");
  await tx.giftCardTransaction.create({ data: { giftCardId: card.id, orderId, amount: -value, kind: "redeemed" } });
}

/** Puts money back on the card an order was paid with (refunds). */
async function creditBack(tx, giftCardId, orderId, amount, { actorName, note } = {}) {
  const value = round2(amount);
  if (!(value > 0)) return;
  await tx.giftCard.update({ where: { id: giftCardId }, data: { balance: { increment: value } } });
  await tx.giftCardTransaction.create({ data: { giftCardId, orderId, amount: value, kind: "refunded", note: note || null, actorName } });
}

/** How much of an order's gift card payment hasn't gone back onto the card. */
async function refundableToCard(prisma, order) {
  if (!order.giftCardId) return 0;
  const { _sum } = await prisma.giftCardTransaction.aggregate({
    where: { giftCardId: order.giftCardId, orderId: order.id, kind: "refunded" },
    _sum: { amount: true },
  });
  return Math.max(0, round2(Number(order.giftCardAmount || 0) - Number(_sum.amount || 0)));
}

/** What the cart shows for an applied card, given the order total. */
function applied(card, total) {
  const use = round2(Math.min(Number(card.balance), Number(total)));
  return { id: card.id, last4: card.last4, amount: use, balance: Number(card.balance), balance_after: round2(Number(card.balance) - use) };
}

module.exports = {
  generateCode,
  normalizeCode,
  hashCode,
  unusableReason,
  findByCode,
  issue,
  list,
  get,
  update,
  redeem,
  creditBack,
  refundableToCard,
  applied,
};
