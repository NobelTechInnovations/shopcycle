const crypto = require("crypto");
const { env } = require("../../config/env");

/**
 * Meta's WhatsApp webhooks: customers' messages, delivery and read
 * receipts for what Oyklane sent, and template review results. Meta
 * retries a delivery until it gets a 200 and can deliver the same event
 * twice, so every message is claimed in message_dedupe before it's stored,
 * and status changes only ever move forward (sent → delivered → read).
 */

/** X-Hub-Signature-256: "sha256=" + HMAC of the exact body with the app secret. */
function verifySignature(rawBody, header) {
  if (!env.META_APP_SECRET || !rawBody || !header) return false;
  const expected = `sha256=${crypto.createHmac("sha256", env.META_APP_SECRET).update(rawBody).digest("hex")}`;
  const a = Buffer.from(String(header));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Claims a message key; false when it was already handled. */
async function claim(prisma, key, storeId) {
  try {
    await prisma.messageDedupe.create({ data: { key, storeId } });
    return true;
  } catch (err) {
    if (err.code === "P2002") return false;
    throw err;
  }
}

const STOP_WORDS = /^\s*(stop|unsubscribe|stop all|opt ?out|cancel offers|band karo)\s*[.!]*\s*$/i;
const START_WORDS = /^\s*(start|subscribe|unstop)\s*[.!]*\s*$/i;

/** The words of a received message, whatever its type. */
function messageText(m) {
  switch (m.type) {
    case "text":
      return m.text?.body || "";
    case "button":
      return m.button?.text || "";
    case "interactive":
      return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || m.interactive?.nfm_reply?.body || "";
    case "image":
    case "video":
    case "document":
      return m[m.type]?.caption || (m.type === "document" ? m.document?.filename : "") || "";
    case "location":
      return [m.location?.name, m.location?.address, m.location ? `(${m.location.latitude}, ${m.location.longitude})` : ""].filter(Boolean).join(" ");
    case "reaction":
      return m.reaction?.emoji ? `Reacted ${m.reaction.emoji}` : "Removed a reaction";
    case "order":
      return `Sent a cart of ${(m.order?.product_items || []).length} item(s)`;
    default:
      return "";
  }
}

const PREVIEW = { image: "📷 Photo", video: "🎥 Video", audio: "🎤 Voice message", document: "📄 Document", sticker: "Sticker", location: "📍 Location" };

/** The store customer with this WhatsApp number, if any (numbers are
 * stored however the shopper typed them — matched on the last 10 digits). */
async function findCustomer(prisma, storeId, phone) {
  const last10 = String(phone).slice(-10);
  if (last10.length < 10) return null;
  const rows = await prisma.customer.findMany({ where: { storeId, phone: { contains: last10.slice(-4) } }, select: { id: true, phone: true, name: true }, take: 50 });
  return rows.find((c) => String(c.phone || "").replace(/\D/g, "").endsWith(last10)) || null;
}

async function conversationFor(prisma, storeId, phone, { profileName } = {}) {
  const existing = await prisma.whatsappConversation.findUnique({ where: { storeId_phone: { storeId, phone } } });
  if (existing) {
    if (profileName && existing.profileName !== profileName) {
      return prisma.whatsappConversation.update({ where: { id: existing.id }, data: { profileName } });
    }
    return existing;
  }
  const customer = await findCustomer(prisma, storeId, phone);
  try {
    return await prisma.whatsappConversation.create({ data: { storeId, phone, profileName: profileName || null, customerId: customer?.id || null } });
  } catch (err) {
    if (err.code === "P2002") return prisma.whatsappConversation.findUnique({ where: { storeId_phone: { storeId, phone } } });
    throw err;
  }
}

async function handleInbound(prisma, conn, value, m, { log, onReceived }) {
  const storeId = conn.storeId;
  if (!(await claim(prisma, `in:${m.id}`, storeId))) return;
  const phone = String(m.from);
  const contact = (value.contacts || []).find((c) => c.wa_id === phone);
  const convo = await conversationFor(prisma, storeId, phone, { profileName: contact?.profile?.name });
  const at = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();
  const text = messageText(m);
  const media = ["image", "video", "audio", "document", "sticker"].includes(m.type) ? m[m.type] : null;
  const msg = await prisma.whatsappMessage.create({
    data: {
      storeId,
      customerId: convo.customerId,
      conversationId: convo.id,
      toPhone: phone,
      direction: "inbound",
      kind: m.type || "unsupported",
      messageType: m.type || "unsupported",
      body: text || PREVIEW[m.type] || `[${m.type}]`,
      status: "received",
      source: "customer",
      providerMessageId: m.id,
      mediaId: media?.id || null,
      mediaMime: media?.mime_type || null,
      dedupeKey: `in:${m.id}`,
      createdAt: at,
    },
  });
  await prisma.whatsappConversation.update({
    where: { id: convo.id },
    data: { lastInboundAt: at, lastMessageAt: at, lastPreview: (text || PREVIEW[m.type] || "Message").slice(0, 140), unread: { increment: 1 }, status: "open" },
  });

  // Opt-out / opt-in by keyword.
  if (m.type === "text" && STOP_WORDS.test(text)) {
    await prisma.whatsappOptOut.upsert({ where: { storeId_phone: { storeId, phone } }, update: { reason: "Replied STOP" }, create: { storeId, phone, reason: "Replied STOP" } });
    if (convo.customerId) await prisma.customer.update({ where: { id: convo.customerId }, data: { acceptsWhatsappMarketing: false } }).catch(() => {});
  } else if (m.type === "text" && START_WORDS.test(text)) {
    await prisma.whatsappOptOut.deleteMany({ where: { storeId, phone } });
  }

  // A reply to a recent broadcast counts as a response (once per recipient).
  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000);
  const recipient = await prisma.whatsappBroadcastRecipient.findFirst({ where: { storeId, phone, sentAt: { gte: since }, repliedAt: null }, orderBy: { sentAt: "desc" } });
  if (recipient) {
    const { count } = await prisma.whatsappBroadcastRecipient.updateMany({ where: { id: recipient.id, repliedAt: null }, data: { repliedAt: at } });
    if (count) await prisma.whatsappBroadcast.update({ where: { id: recipient.broadcastId }, data: { replied: { increment: 1 } } });
  }

  if (onReceived) await onReceived({ storeId, conversation: convo, message: msg, text, log }).catch((err) => log?.warn({ err }, "whatsapp: after-receive hook failed"));
}

const RANK = { queued: 0, sent: 1, delivered: 2, read: 3 };

async function handleStatus(prisma, conn, s) {
  const at = s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date();
  const status = s.status; // sent | delivered | read | failed
  const error = s.errors?.[0] ? [s.errors[0].title, s.errors[0].error_data?.details || s.errors[0].message].filter(Boolean).join(": ") : null;
  const lower = Object.keys(RANK).filter((k) => RANK[k] < (RANK[status] ?? 99));
  const stamp = status === "delivered" ? { deliveredAt: at } : status === "read" ? { readAt: at } : status === "failed" ? { failedAt: at } : {};

  // The message row (inbox, flows, single sends).
  if (status === "failed") {
    await prisma.whatsappMessage.updateMany({ where: { providerMessageId: s.id, storeId: conn.storeId }, data: { status: "failed", error, failedAt: at } });
  } else {
    await prisma.whatsappMessage.updateMany({ where: { providerMessageId: s.id, storeId: conn.storeId, status: { in: lower } }, data: { status, ...stamp } });
  }

  // A broadcast recipient: move it forward and count it on the broadcast once.
  const r = await prisma.whatsappBroadcastRecipient.findFirst({ where: { providerMessageId: s.id, storeId: conn.storeId } });
  if (!r) return;
  if (status === "failed") {
    const { count } = await prisma.whatsappBroadcastRecipient.updateMany({ where: { id: r.id, status: { not: "failed" } }, data: { status: "failed", error } });
    if (count) await prisma.whatsappBroadcast.update({ where: { id: r.broadcastId }, data: { failed: { increment: 1 }, ...(r.status === "sent" || r.status === "delivered" || r.status === "read" ? { sent: { decrement: 1 } } : {}) } });
    return;
  }
  const { count } = await prisma.whatsappBroadcastRecipient.updateMany({ where: { id: r.id, status: { in: lower } }, data: { status, ...stamp } });
  if (!count) return;
  const inc = {};
  // Delivered before "sent" arrived (out of order) still counts as delivered; read implies delivered.
  if (status === "delivered" || (status === "read" && RANK[r.status] < RANK.delivered)) inc.delivered = { increment: 1 };
  if (status === "read") inc.read = { increment: 1 };
  if (Object.keys(inc).length) await prisma.whatsappBroadcast.update({ where: { id: r.broadcastId }, data: inc });
}

/** One webhook delivery. Returns how many changes it handled. */
async function processWebhook(prisma, payload, { log, onReceived, onTemplate } = {}) {
  if (payload?.object !== "whatsapp_business_account") return 0;
  let handled = 0;
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      if (change.field === "messages") {
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;
        const conns = await prisma.metaConnection.findMany({ where: { phoneNumberId: String(phoneNumberId) } });
        for (const conn of conns) {
          for (const m of value.messages || []) {
            await handleInbound(prisma, conn, value, m, { log, onReceived });
            handled += 1;
          }
          for (const s of value.statuses || []) {
            await handleStatus(prisma, conn, s);
            handled += 1;
          }
        }
      } else if (change.field === "message_template_status_update" || change.field === "template_category_update") {
        const conns = await prisma.metaConnection.findMany({ where: { wabaId: String(entry.id) }, select: { storeId: true } });
        for (const c of conns) if (onTemplate) await onTemplate({ storeId: c.storeId, field: change.field, value }).catch(() => {});
        handled += 1;
      } else {
        log?.info({ field: change.field, waba: entry.id }, "whatsapp webhook: not handled");
      }
    }
  }
  return handled;
}

module.exports = { verifySignature, processWebhook, messageText, conversationFor, findCustomer, claim, STOP_WORDS };
