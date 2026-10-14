const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { toE164 } = require("../../lib/phone");
const ai = require("../../lib/ai");
const cloud = require("./cloud");
const inbound = require("./inbound");

/**
 * WhatsApp for one store: the shared inbox (conversations, notes,
 * assignment, labels), sending inside and outside Meta's 24-hour
 * customer-service window, message templates, consent and opt-outs, and
 * AI-drafted replies. Sending rules are Meta's, enforced before the call:
 *
 *   - Free text, media and replies only within 24 hours of the customer's
 *     last message ("the window").
 *   - Outside it, an approved template.
 *   - Marketing templates only to customers who opted in and haven't
 *     opted out.
 */

const WINDOW_MS = 24 * 3600 * 1000;
const windowOpen = (convo) => Boolean(convo?.lastInboundAt && Date.now() - new Date(convo.lastInboundAt).getTime() < WINDOW_MS);

// ── Templates ────────────────────────────────────────────────────────────

/** {{1}}, {{2}}… in a piece of template text. */
const varsIn = (text) => [...String(text || "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));

const REJECTION_HELP = {
  INVALID_FORMAT: "The format isn't allowed — check variables ({{1}}, {{2}}… in order, not at the very start or end), spelling and the button links.",
  INCORRECT_CATEGORY: "Meta thinks the category is wrong. Offers and promotions are Marketing; order and delivery updates are Utility.",
  PROMOTIONAL: "It reads as promotional, so it can't be Utility. Submit it as Marketing, or remove offer wording.",
  TAG_CONTENT_MISMATCH: "The content doesn't match the category or language you chose.",
  ABUSIVE_CONTENT: "Meta flagged the wording as abusive or threatening. Rewrite it in a neutral tone.",
  SCAM: "Meta flagged it as a possible scam. Avoid asking for payments or personal details in unusual ways, and use your own domain in links.",
  INVALID_PARAMETER: "A variable sample or link isn't valid. Give realistic samples for every variable.",
  NONE: "Meta didn't give a reason. Check it against Meta's template guidelines and resubmit.",
};

/** The template builder's form → Meta's components, with every rule
 * Meta would reject it for checked first (so the seller gets the reason
 * now, not a rejection hours later). */
function buildTemplate(input) {
  const errors = [];
  const name = String(input.name || "").trim();
  if (!/^[a-z0-9_]{1,512}$/.test(name)) errors.push("Name: lowercase letters, numbers and underscores only (for example diwali_offer_2026).");
  const category = ["MARKETING", "UTILITY", "AUTHENTICATION"].includes(input.category) ? input.category : null;
  if (!category) errors.push("Choose a category.");
  const language = String(input.language || "").trim();
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language)) errors.push("Choose a language.");

  const components = [];
  const header = input.header || {};
  if (header.type === "text") {
    const t = String(header.text || "");
    if (!t.trim()) errors.push("Header: add the header text or choose no header.");
    if (t.length > 60) errors.push("Header: 60 characters at most.");
    const hv = varsIn(t);
    if (hv.length > 1) errors.push("Header: one variable at most.");
    const comp = { type: "HEADER", format: "TEXT", text: t };
    if (hv.length) {
      if (!header.example) errors.push("Header: give a sample for {{1}}.");
      comp.example = { header_text: [String(header.example || "")] };
    }
    components.push(comp);
  } else if (["image", "video", "document"].includes(header.type)) {
    if (!header.sampleHandle) errors.push(`Header: upload a sample ${header.type} (Meta reviews it with the template).`);
    components.push({ type: "HEADER", format: header.type.toUpperCase(), example: { header_handle: [header.sampleHandle] } });
  }

  const body = String(input.body?.text || "");
  if (!body.trim()) errors.push("Message: write the message text.");
  if (body.length > 1024) errors.push("Message: 1,024 characters at most.");
  const bv = varsIn(body);
  const distinct = [...new Set(bv)].sort((a, b) => a - b);
  if (distinct.some((v, i) => v !== i + 1)) errors.push("Message: number variables in order — {{1}}, {{2}}, {{3}}…");
  if (/^\s*\{\{\s*\d+\s*\}\}/.test(body) || /\{\{\s*\d+\s*\}\}[\s.!?]*$/.test(body)) errors.push("Message: it can't start or end with a variable — add words before or after it.");
  if (/\{\{\s*\d+\s*\}\}\s*\{\{\s*\d+\s*\}\}/.test(body)) errors.push("Message: put words between two variables.");
  const words = body.replace(/\{\{\s*\d+\s*\}\}/g, " ").split(/\s+/).filter(Boolean).length;
  if (distinct.length && words < distinct.length * 3) errors.push("Message: too many variables for its length — add more fixed words.");
  const samples = Array.isArray(input.body?.examples) ? input.body.examples.map(String) : [];
  if (distinct.length && (samples.length < distinct.length || samples.slice(0, distinct.length).some((x) => !x.trim()))) errors.push("Message: give a sample for every variable.");
  const bodyComp = { type: "BODY", text: body };
  if (distinct.length) bodyComp.example = { body_text: [samples.slice(0, distinct.length)] };
  components.push(bodyComp);

  const footer = String(input.footer?.text || "");
  if (footer) {
    if (footer.length > 60) errors.push("Footer: 60 characters at most.");
    if (varsIn(footer).length) errors.push("Footer: variables aren't allowed.");
    components.push({ type: "FOOTER", text: footer });
  }

  const buttons = Array.isArray(input.buttons) ? input.buttons : [];
  if (buttons.length) {
    if (buttons.length > 10) errors.push("Buttons: 10 at most.");
    if (buttons.filter((b) => b.type === "URL").length > 2) errors.push("Buttons: 2 website buttons at most.");
    if (buttons.filter((b) => b.type === "PHONE_NUMBER").length > 1) errors.push("Buttons: 1 call button at most.");
    const out = [];
    for (const [i, b] of buttons.entries()) {
      const label = String(b.text || "").trim();
      if (b.type !== "COPY_CODE" && (!label || label.length > 25)) errors.push(`Button ${i + 1}: a label of 1–25 characters.`);
      if (b.type === "QUICK_REPLY") out.push({ type: "QUICK_REPLY", text: label });
      else if (b.type === "URL") {
        const url = String(b.url || "").trim();
        if (!/^https:\/\/[^\s]+$/.test(url.replace(/\{\{1\}\}$/, "x"))) errors.push(`Button ${i + 1}: a full https:// link.`);
        const uv = varsIn(url);
        if (uv.length > 1 || (uv.length && !/\{\{1\}\}$/.test(url))) errors.push(`Button ${i + 1}: one variable at most, at the end of the link.`);
        const btn = { type: "URL", text: label, url };
        if (uv.length) {
          if (!b.example) errors.push(`Button ${i + 1}: give a sample link.`);
          btn.example = [String(b.example || "")];
        }
        out.push(btn);
      } else if (b.type === "PHONE_NUMBER") {
        const phone = toE164(b.phone);
        if (!phone) errors.push(`Button ${i + 1}: a phone number with country code.`);
        out.push({ type: "PHONE_NUMBER", text: label, phone_number: `+${phone || ""}` });
      } else if (b.type === "COPY_CODE") {
        if (!b.example) errors.push(`Button ${i + 1}: give the sample coupon code.`);
        out.push({ type: "COPY_CODE", example: String(b.example || "") });
      }
    }
    components.push({ type: "BUTTONS", buttons: out });
  }
  if (errors.length) throw new HttpError(400, errors[0], { errors });
  return { name, category, language, components, allow_category_change: Boolean(input.allowCategoryChange) };
}

/** A Meta template, for the admin. */
function shapeTemplate(t) {
  const comp = (type) => (t.components || []).find((c) => c.type === type);
  const body = comp("BODY")?.text || "";
  const header = comp("HEADER");
  return {
    id: t.id,
    name: t.name,
    language: t.language,
    category: t.category,
    status: t.status,
    quality: t.quality_score?.score || null,
    rejectedReason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : t.status === "REJECTED" ? "NONE" : null,
    fix: t.status === "REJECTED" ? REJECTION_HELP[t.rejected_reason] || REJECTION_HELP.NONE : null,
    header: header ? { format: header.format, text: header.text || null } : null,
    body,
    footer: comp("FOOTER")?.text || null,
    buttons: comp("BUTTONS")?.buttons || [],
    bodyVariables: [...new Set(varsIn(body))].length,
    headerVariables: header?.format === "TEXT" ? varsIn(header.text).length : 0,
    mediaHeader: header && header.format !== "TEXT" ? header.format.toLowerCase() : null,
    urlButtonVariable: (comp("BUTTONS")?.buttons || []).findIndex((b) => b.type === "URL" && /\{\{1\}\}/.test(b.url || "")),
    components: t.components || [],
  };
}

/** Approved and pending templates on the store's account — or on
 * Oyklane's shared account when `conn` is that one. */
async function templates(prisma, store, { conn } = {}) {
  conn = conn || (await cloud.connectionOrThrow(prisma, store.id, { needNumber: false }));
  return (await cloud.listTemplates(conn)).map(shapeTemplate);
}

/** Send-time components for a template: body/header text values, a media
 * header link, a URL button's suffix. */
function templateComponents(tpl, { body = [], header = [], headerMediaUrl, buttonUrl } = {}) {
  const out = [];
  if (tpl.mediaHeader) {
    if (!headerMediaUrl) throw new HttpError(400, `"${tpl.name}" has a ${tpl.mediaHeader} header — add the ${tpl.mediaHeader} link.`);
    out.push({ type: "header", parameters: [{ type: tpl.mediaHeader, [tpl.mediaHeader]: { link: headerMediaUrl } }] });
  } else if (tpl.headerVariables) {
    out.push({ type: "header", parameters: header.slice(0, tpl.headerVariables).map((text) => ({ type: "text", text: String(text || "-") })) });
  }
  if (tpl.bodyVariables) {
    if (body.length < tpl.bodyVariables || body.slice(0, tpl.bodyVariables).some((v) => !String(v ?? "").trim())) {
      throw new HttpError(400, `"${tpl.name}" needs ${tpl.bodyVariables} value${tpl.bodyVariables === 1 ? "" : "s"} for its variables.`);
    }
    out.push({ type: "body", parameters: body.slice(0, tpl.bodyVariables).map((text) => ({ type: "text", text: String(text) })) });
  }
  if (tpl.urlButtonVariable >= 0) {
    out.push({ type: "button", sub_type: "url", index: String(tpl.urlButtonVariable), parameters: [{ type: "text", text: String(buttonUrl || "") }] });
  }
  return out;
}

/** The text a template sends, with values filled in (for the inbox). */
function renderTemplateText(tpl, body = []) {
  return String(tpl.body || "").replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => body[Number(n) - 1] ?? `{{${n}}}`);
}

// ── Consent ──────────────────────────────────────────────────────────────

async function optedOut(prisma, storeId, phone) {
  return Boolean(await prisma.whatsappOptOut.findUnique({ where: { storeId_phone: { storeId, phone } } }));
}

/** May this number get a marketing message? */
async function marketingAllowed(prisma, storeId, phone, customer) {
  if (await optedOut(prisma, storeId, phone)) return { ok: false, reason: "Opted out of WhatsApp messages" };
  if (!customer?.acceptsWhatsappMarketing) return { ok: false, reason: "Hasn't agreed to WhatsApp marketing" };
  return { ok: true };
}

// ── Sending ──────────────────────────────────────────────────────────────

/**
 * Sends one message and records it in the conversation. `dedupeKey`
 * (broadcasts, flows) makes a retry a no-op: the key is claimed first.
 * Returns the stored message; throws Meta's error (already in words).
 */
async function deliver(prisma, store, { phone, payload, record, dedupeKey, conn }) {
  conn = conn || (await cloud.connectionOrThrow(prisma, store.id));
  if (dedupeKey && !(await inbound.claim(prisma, dedupeKey, store.id))) return { duplicate: true };
  const convo = await inbound.conversationFor(prisma, store.id, phone);
  let sent;
  try {
    sent = await cloud.send(conn, { to: phone, ...payload });
  } catch (err) {
    // A failed send frees the key, so a later retry can try again.
    if (dedupeKey) await prisma.messageDedupe.delete({ where: { key: dedupeKey } }).catch(() => {});
    await prisma.whatsappMessage.create({
      data: { storeId: store.id, conversationId: convo.id, customerId: convo.customerId, toPhone: phone, direction: "outbound", status: "failed", error: err.message, failedAt: new Date(), ...record },
    });
    throw err;
  }
  const now = new Date();
  // Sent from Oyklane's shared number: the customer's replies arrive there,
  // so the conversation remembers it (and replies go out from it too).
  if (Boolean(conn.platform) !== Boolean(convo.viaPlatform)) await prisma.whatsappConversation.update({ where: { id: convo.id }, data: { viaPlatform: Boolean(conn.platform) } });
  const message = await prisma.whatsappMessage.create({
    data: {
      storeId: store.id,
      conversationId: convo.id,
      customerId: convo.customerId,
      toPhone: phone,
      direction: "outbound",
      status: "sent",
      providerMessageId: sent.id,
      dedupeKey: dedupeKey || null,
      ...record,
    },
  });
  await prisma.whatsappConversation.update({ where: { id: convo.id }, data: { lastMessageAt: now, lastPreview: String(record.body || "").slice(0, 140) } });
  return { message, conversation: convo };
}

const userName = (user) => user?.name || user?.email || null;


/**
 * Everything "Message a customer" fills in for one customer: their recent
 * orders (the chosen one, or the latest), and the values templates use —
 * the same names as Oyklane's standard templates (standard-templates.js).
 * With only a `phone` (a new number), just whether a chat already exists.
 */
async function composeContext(prisma, store, { customerId, orderId, phone: rawPhone } = {}) {
  const { formatCurrency } = require("@shopcycle/utils");
  const { realEmail } = require("../../lib/placeholder-email");
  const standard = require("./standard-templates");
  const customer = customerId ? await prisma.customer.findFirst({ where: { id: String(customerId), storeId: store.id } }) : null;
  if (customerId && !customer) throw new HttpError(404, "Customer not found");
  const phone = toE164(customer?.phone || rawPhone);
  const money = (n, cur) => formatCurrency(Number(n || 0), cur || store.currency || "INR");
  const orders = customer
    ? await prisma.order.findMany({
        where: { storeId: store.id, customerId: customer.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { fulfillments: { orderBy: { createdAt: "desc" } } },
      })
    : [];
  const order = (orderId && orders.find((o) => o.id === orderId)) || orders[0] || null;
  const shipment = order?.fulfillments.find((f) => f.status !== "cancelled");
  let link = null;
  if (order) link = await require("../orders/notify").statusUrlFor(prisma, store, order).catch(() => null);
  const name = String(order?.shippingName || customer?.name || "").trim();
  const values = {
    "customer.first_name": name.split(/\s+/)[0] || "",
    "customer.name": name,
    "store.name": store.name,
    ...(order && {
      "order.number": `#${order.orderNumber}`,
      "order.total": money(order.total, order.currency),
      "order.status": String(order.fulfillmentStatus || order.paymentStatus || "").replace(/_/g, " "),
      "order.courier": shipment?.courier || "",
      "order.tracking": shipment?.trackingNumber || "",
      "order.link": link || "",
    }),
  };
  const convo = phone ? await prisma.whatsappConversation.findFirst({ where: { storeId: store.id, phone }, select: { id: true } }) : null;
  return {
    customer: customer && { id: customer.id, name: customer.name, phone: customer.phone, email: realEmail(customer.email), acceptsWhatsappMarketing: customer.acceptsWhatsappMarketing },
    phone,
    orders: orders.map((o) => ({ id: o.id, number: `#${o.orderNumber}`, total: money(o.total, o.currency), status: o.fulfillmentStatus || o.paymentStatus, createdAt: o.createdAt })),
    orderId: order?.id || null,
    values,
    // The end of the order-page button (…/orders/<code>) for templates whose button link ends in {{1}}.
    buttonValue: link ? link.split("/orders/").pop() : "",
    // Oyklane's standard templates: which value goes in each {{n}}.
    standard: Object.fromEntries(Object.values(standard.KINDS).map((k) => [k.name, k.vars])),
    conversationId: convo?.id || null,
  };
}

/** From the inbox: a reply (text or media) inside the window, or a template. */
async function sendFromInbox(prisma, store, conversationId, input, user) {
  const convo = await prisma.whatsappConversation.findFirst({ where: { id: conversationId, storeId: store.id }, include: { customer: true } });
  if (!convo) throw new HttpError(404, "Conversation not found");
  const who = { sentById: user?.id || null, sentByName: userName(user), source: "inbox" };
  const platform = require("./platform");
  // The customer is talking to Oyklane's shared number (order updates sent
  // for this store): replies must come from that number. A store with no
  // number of its own starts chats from it too — Oyklane's templates only.
  let conn;
  if (convo.viaPlatform) conn = await platform.connection(prisma);
  else if (!(await cloud.ownConnection(prisma, store.id))) {
    conn = await platform.connection(prisma);
    if (!conn) throw new HttpError(400, "Connect your WhatsApp number first (Apps ▸ WhatsApp).", { reason: "not_connected" });
  }
  if (convo.viaPlatform && !conn) throw new HttpError(400, "This customer wrote to Oyklane's shared number, which isn't available right now.");
  if (input.kind === "text" || input.kind === "media") {
    if (!windowOpen(convo)) throw new HttpError(400, "It's been more than 24 hours since this customer's last message, so WhatsApp only allows an approved template. Choose \"Template\".", { reason: "window_closed" });
    if (input.kind === "text") {
      const text = String(input.body || "").trim();
      if (!text) throw new HttpError(400, "Write a message.");
      return deliver(prisma, store, { conn, phone: convo.phone, payload: { type: "text", text: { body: text.slice(0, 4096), preview_url: true } }, record: { kind: "text", messageType: "text", body: text, ...who } });
    }
    const type = ["image", "video", "document", "audio"].includes(input.mediaType) ? input.mediaType : "document";
    if (!input.mediaId) throw new HttpError(400, "Upload the file first.");
    const media = { id: input.mediaId, ...(input.caption && type !== "audio" ? { caption: String(input.caption).slice(0, 1024) } : {}), ...(type === "document" && input.filename ? { filename: input.filename } : {}) };
    return deliver(prisma, store, { conn, phone: convo.phone, payload: { type, [type]: media }, record: { kind: type, messageType: type, body: input.caption || `[${type}]`, mediaId: input.mediaId, ...who } });
  }
  // Template.
  const all = await templates(prisma, store, { conn });
  const tpl = all.find((t) => t.name === input.templateName && t.language === input.language && t.status === "APPROVED");
  if (!tpl) throw new HttpError(400, "Choose an approved template.");
  if (conn?.platform && tpl.category !== "UTILITY") {
    throw new HttpError(400, "From Oyklane's shared number you can send order updates (Utility templates) only. Connect your own WhatsApp number to send offers and other messages.");
  }
  if (tpl.category === "MARKETING") {
    const allowed = await marketingAllowed(prisma, store.id, convo.phone, convo.customer);
    if (!allowed.ok && !input.confirmConsent) throw new HttpError(400, `${allowed.reason}. Marketing templates need the customer's consent.`, { reason: "no_consent" });
    if (await optedOut(prisma, store.id, convo.phone)) throw new HttpError(400, "This customer opted out of WhatsApp messages.", { reason: "opted_out" });
  }
  const components = templateComponents(tpl, input);
  return deliver(prisma, store, {
    conn,
    phone: convo.phone,
    payload: { type: "template", template: { name: tpl.name, language: { code: tpl.language }, components } },
    record: { kind: "template", messageType: "template", templateName: tpl.name, templateLanguage: tpl.language, body: renderTemplateText(tpl, input.body), ...who },
  });
}

/** Starts a conversation with a customer (always a template). */
async function startConversation(prisma, store, { phone, customerId, ...input }, user) {
  let to = toE164(phone);
  let customer = null;
  if (customerId) {
    customer = await prisma.customer.findFirst({ where: { id: customerId, storeId: store.id } });
    if (!customer) throw new HttpError(404, "Customer not found");
    to = to || toE164(customer.phone);
  }
  if (!to) throw new HttpError(400, "Enter a mobile number with country code (for example +91 98765 43210).");
  const convo = await inbound.conversationFor(prisma, store.id, to);
  if (customer && !convo.customerId) await prisma.whatsappConversation.update({ where: { id: convo.id }, data: { customerId: customer.id } });
  return sendFromInbox(prisma, store, convo.id, { ...input, kind: "template" }, user);
}

/** Tells Meta the seller read the customer's last message (blue ticks). */
async function markRead(prisma, store, conversationId) {
  const convo = await prisma.whatsappConversation.findFirst({ where: { id: conversationId, storeId: store.id } });
  if (!convo) throw new HttpError(404, "Conversation not found");
  await prisma.whatsappConversation.update({ where: { id: convo.id }, data: { unread: 0 } });
  const last = await prisma.whatsappMessage.findFirst({ where: { conversationId: convo.id, direction: "inbound" }, orderBy: { createdAt: "desc" } });
  if (last?.providerMessageId && windowOpen(convo)) {
    const conn = await cloud.connectionOrThrow(prisma, store.id).catch(() => null);
    if (conn) await require("../meta/service").graphRequest(`/${conn.phoneNumberId}/messages`, { method: "POST", token: cloud.waToken(conn), body: { messaging_product: "whatsapp", status: "read", message_id: last.providerMessageId } }).catch(() => {});
  }
  return { ok: true };
}

// ── Inbox ────────────────────────────────────────────────────────────────

async function listConversations(prisma, storeId, { q, status, assigned, label, unread, userId, page = 1 } = {}) {
  const where = { storeId };
  if (status && status !== "all") where.status = status;
  if (assigned === "me" && userId) where.assignedToId = userId;
  else if (assigned === "none") where.assignedToId = null;
  if (label) where.labels = { has: label };
  if (unread === "true") where.unread = { gt: 0 };
  if (q) {
    const digits = String(q).replace(/\D/g, "");
    where.OR = [
      { profileName: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { lastPreview: { contains: q, mode: "insensitive" } },
      ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
    ];
  }
  const take = 40;
  const [rows, total] = await Promise.all([
    prisma.whatsappConversation.findMany({ where, orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }], skip: (page - 1) * take, take, include: { customer: { select: { id: true, name: true, email: true } } } }),
    prisma.whatsappConversation.count({ where }),
  ]);
  return { conversations: rows.map((c) => ({ ...c, windowOpen: windowOpen(c) })), total, page };
}

/** One conversation with its messages, notes and the customer's store
 * profile (orders, spend, open checkout) for the side panel. */
async function getConversation(prisma, store, id, { before } = {}) {
  const convo = await prisma.whatsappConversation.findFirst({ where: { id, storeId: store.id }, include: { customer: true, notes: { orderBy: { createdAt: "asc" } } } });
  if (!convo) throw new HttpError(404, "Conversation not found");
  const messages = await prisma.whatsappMessage.findMany({
    where: { conversationId: convo.id, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  let profile = null;
  if (convo.customerId) {
    const [orders, agg, cart] = await Promise.all([
      prisma.order.findMany({ where: { storeId: store.id, customerId: convo.customerId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, orderNumber: true, total: true, cancelledAt: true, paymentStatus: true, fulfillmentStatus: true, createdAt: true } }),
      prisma.order.aggregate({ where: { storeId: store.id, customerId: convo.customerId, cancelledAt: null }, _sum: { total: true }, _count: true }),
      convo.customer?.email
        ? prisma.cartSession.findFirst({ where: { storeId: store.id, email: convo.customer.email, checkoutStartedAt: { not: null }, recoveredAt: null }, orderBy: { updatedAt: "desc" }, select: { id: true, data: true, checkoutStartedAt: true, updatedAt: true } }).catch(() => null)
        : null,
    ]);
    let openCheckout = null;
    if (cart) {
      const lines = Array.isArray(cart.data?.items) ? cart.data.items.slice(0, 10) : [];
      const variants = await prisma.productVariant.findMany({ where: { id: { in: lines.map((l) => l.variantId).filter(Boolean) } }, select: { id: true, title: true, price: true, product: { select: { title: true } } } });
      const byId = Object.fromEntries(variants.map((v) => [v.id, v]));
      openCheckout = {
        startedAt: cart.checkoutStartedAt,
        items: lines.map((l) => {
          const v = byId[l.variantId];
          return { title: v ? `${v.product.title}${v.title && !/^default/i.test(v.title) ? ` — ${v.title}` : ""}` : "Item no longer available", quantity: Number(l.quantity || 1), price: v?.price ?? null };
        }),
      };
    }
    profile = { orders, ordersCount: agg._count, totalSpent: agg._sum.total || 0, openCheckout };
  }
  const optOut = await optedOut(prisma, store.id, convo.phone);
  return { conversation: { ...convo, windowOpen: windowOpen(convo), windowEndsAt: convo.lastInboundAt ? new Date(new Date(convo.lastInboundAt).getTime() + WINDOW_MS) : null, optedOut: optOut }, messages: messages.reverse(), profile };
}

async function updateConversation(prisma, store, id, { status, assignedToId, labels, handledBy, customerId }, teamMember) {
  const convo = await prisma.whatsappConversation.findFirst({ where: { id, storeId: store.id } });
  if (!convo) throw new HttpError(404, "Conversation not found");
  const data = {};
  if (status) data.status = status === "closed" ? "closed" : "open";
  if (assignedToId !== undefined) {
    data.assignedToId = assignedToId || null;
    data.assignedToName = assignedToId ? teamMember?.name || teamMember?.email || null : null;
  }
  if (Array.isArray(labels)) data.labels = [...new Set(labels.map((l) => String(l).trim().slice(0, 30)).filter(Boolean))].slice(0, 12);
  if (handledBy) data.handledBy = handledBy === "ai" ? "ai" : "human";
  if (customerId !== undefined) {
    if (customerId) {
      const c = await prisma.customer.findFirst({ where: { id: customerId, storeId: store.id }, select: { id: true } });
      if (!c) throw new HttpError(404, "Customer not found");
    }
    data.customerId = customerId || null;
  }
  return prisma.whatsappConversation.update({ where: { id }, data });
}

async function addNote(prisma, store, id, body, user) {
  const convo = await prisma.whatsappConversation.findFirst({ where: { id, storeId: store.id } });
  if (!convo) throw new HttpError(404, "Conversation not found");
  const text = String(body || "").trim();
  if (!text) throw new HttpError(400, "Write the note.");
  return prisma.whatsappNote.create({ data: { conversationId: id, storeId: store.id, authorId: user?.id || null, authorName: userName(user), body: text.slice(0, 4000) } });
}

/** An AI draft reply — never sent by itself from the inbox; the seller
 * edits and sends. Grounded in the conversation and the customer's real
 * orders; says when it should hand to a person. */
async function suggestReply(prisma, store, id, { instructions } = {}) {
  const { conversation, messages, profile } = await getConversation(prisma, store, id);
  if (!ai.aiConfigured()) throw new HttpError(503, "AI replies aren't set up on Oyklane yet.");
  const transcript = messages
    .slice(-20)
    .map((m) => `${m.direction === "inbound" ? "Customer" : "Store"}: ${m.body}`)
    .join("\n");
  const orders = (profile?.orders || []).map((o) => `#${o.orderNumber} ₹${o.total} — ${o.cancelledAt ? "cancelled" : "active"}, payment ${o.paymentStatus}, delivery ${o.fulfillmentStatus || "unfulfilled"} (${new Date(o.createdAt).toDateString()})`).join("\n");
  const system = `You draft WhatsApp replies for "${store.name}", an online store. Write in the customer's language, warm and short (under 80 words), no markdown. Use only facts from the conversation and the order list — never invent prices, stock, delivery dates or policies. If you can't answer from these facts, or the customer is upset, asks for a refund or asks for a person, say a team member will reply shortly and set handoff to true. Answer as JSON: {"reply": "...", "handoff": true|false, "reason": "..."}${instructions ? `\n\nThe store's own instructions (follow them unless they conflict with the rules above):\n${instructions}` : ""}`;
  const prompt = `Customer: ${conversation.customer?.name || conversation.profileName || "unknown"}\nTheir orders:\n${orders || "none found"}\n\nConversation:\n${transcript}\n\nDraft the store's next reply.`;
  const out = ai.parseJsonObject(await ai.completeText({ system, prompt, maxTokens: 400 }));
  if (!out?.reply) throw new HttpError(502, "The AI didn't return a reply. Try again.");
  return { reply: String(out.reply).slice(0, 1000), handoff: Boolean(out.handoff), reason: out.reason ? String(out.reason).slice(0, 200) : null, windowOpen: conversation.windowOpen };
}

// ── Opt-outs ─────────────────────────────────────────────────────────────

async function listOptOuts(prisma, storeId) {
  return prisma.whatsappOptOut.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 500 });
}

async function addOptOut(prisma, storeId, phone, reason) {
  const p = toE164(phone);
  if (!p) throw new HttpError(400, "Enter a mobile number with country code.");
  return prisma.whatsappOptOut.upsert({ where: { storeId_phone: { storeId, phone: p } }, update: { reason: reason || "Added by the store" }, create: { storeId, phone: p, reason: reason || "Added by the store" } });
}

async function removeOptOut(prisma, storeId, id) {
  await prisma.whatsappOptOut.deleteMany({ where: { id, storeId } });
}

/** Records a customer's WhatsApp marketing consent (or its withdrawal). */
async function setConsent(prisma, storeId, customerId, accepts, source) {
  const c = await prisma.customer.findFirst({ where: { id: customerId, storeId } });
  if (!c) throw new HttpError(404, "Customer not found");
  const updated = await prisma.customer.update({
    where: { id: c.id },
    data: { acceptsWhatsappMarketing: Boolean(accepts), whatsappConsentAt: new Date(), whatsappConsentSource: String(source || "admin").slice(0, 60) },
  });
  const phone = toE164(c.phone);
  if (phone && accepts) await prisma.whatsappOptOut.deleteMany({ where: { storeId, phone } });
  return updated;
}

/** Message history (older single-send screen and customer pages). */
function listMessages(prisma, storeId, { customerId, page = 1, pageSize = 50 } = {}) {
  return prisma.whatsappMessage.findMany({
    where: { storeId, ...(customerId ? { customerId } : {}) },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
}

module.exports = {
  composeContext,
  WINDOW_MS,
  windowOpen,
  varsIn,
  buildTemplate,
  shapeTemplate,
  templates,
  templateComponents,
  renderTemplateText,
  REJECTION_HELP,
  optedOut,
  marketingAllowed,
  deliver,
  sendFromInbox,
  startConversation,
  markRead,
  listConversations,
  getConversation,
  updateConversation,
  addNote,
  suggestReply,
  listOptOuts,
  addOptOut,
  removeOptOut,
  setConsent,
  listMessages,
  pricePerMessage: (category) => (category === "MARKETING" ? env.WHATSAPP_PRICE_MARKETING : env.WHATSAPP_PRICE_UTILITY),
};
