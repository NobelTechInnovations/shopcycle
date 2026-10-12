const { HttpError } = require("@shopcycle/utils");
const { toE164 } = require("../../lib/phone");
const { storefrontUrl } = require("../../lib/storefront-url");
const cloud = require("./cloud");
const service = require("./service");

/**
 * Bulk sends of one approved template. WhatsApp's rules, enforced here:
 * only customers who agreed to WhatsApp marketing, never anyone who
 * opted out, one message per number, and no more unique people a day
 * than the number's messaging limit. Sending happens in the jobs tick,
 * in small batches; each recipient is claimed before it's sent, so a
 * restarted job never messages anyone twice.
 */

const SEGMENTS = {
  consented: "Everyone who agreed to WhatsApp marketing",
  buyers: "Customers who have ordered",
  repeat: "Repeat customers (2+ orders)",
  lapsed: "Customers who haven't ordered recently",
  abandoned: "Started checkout but didn't order (last 30 days)",
  never: "Signed up but never ordered",
};

const LIMIT_TIER = { TIER_50: 50, TIER_250: 250, TIER_1K: 1000, TIER_10K: 10000, TIER_100K: 100000, TIER_UNLIMITED: Infinity };

const VARIABLE_SOURCES = [
  { value: "customer.first_name", label: "Customer's first name" },
  { value: "customer.name", label: "Customer's full name" },
  { value: "store.name", label: "Your store's name" },
  { value: "store.url", label: "Your store's link" },
  { value: "text", label: "Fixed text" },
];

/** Customers matching the audience, before consent and phone checks. */
async function audienceCustomers(prisma, storeId, audience = {}) {
  const where = { storeId };
  const days = (n) => new Date(Date.now() - Number(n) * 24 * 3600 * 1000);
  const seg = SEGMENTS[audience.segment] ? audience.segment : "consented";
  if (seg === "buyers") where.orders = { some: { cancelledAt: null } };
  if (seg === "never") where.orders = { none: {} };
  if (seg === "lapsed") {
    const d = Math.max(7, Number(audience.days) || 60);
    where.AND = [{ orders: { some: { cancelledAt: null } } }, { orders: { none: { createdAt: { gte: days(d) } } } }];
  }
  let customers = await prisma.customer.findMany({
    where,
    select: { id: true, name: true, email: true, phone: true, acceptsWhatsappMarketing: true, _count: { select: { orders: true } } },
    take: 50000,
  });
  if (seg === "repeat") customers = customers.filter((c) => c._count.orders >= 2);
  if (seg === "abandoned") {
    const carts = await prisma.cartSession.findMany({ where: { storeId, checkoutStartedAt: { gte: days(30) }, recoveredAt: null, email: { not: null } }, select: { email: true } });
    const emails = new Set(carts.map((c) => String(c.email).toLowerCase()));
    customers = customers.filter((c) => emails.has(String(c.email).toLowerCase()));
  }
  if (Number(audience.minOrders) > 0) customers = customers.filter((c) => c._count.orders >= Number(audience.minOrders));
  return customers;
}

/**
 * Who would get it and who wouldn't (and why) — for the preview, the
 * estimate and, at send time, the real list.
 */
async function resolveRecipients(prisma, store, audience) {
  const customers = await audienceCustomers(prisma, store.id, audience);
  const optOuts = new Set((await prisma.whatsappOptOut.findMany({ where: { storeId: store.id }, select: { phone: true } })).map((o) => o.phone));
  const seen = new Set();
  const recipients = [];
  const skipped = { noConsent: 0, noPhone: 0, optedOut: 0, duplicate: 0 };
  for (const c of customers) {
    if (!c.acceptsWhatsappMarketing) {
      skipped.noConsent += 1;
      continue;
    }
    const phone = toE164(c.phone);
    if (!phone) {
      skipped.noPhone += 1;
      continue;
    }
    if (optOuts.has(phone)) {
      skipped.optedOut += 1;
      continue;
    }
    if (seen.has(phone)) {
      skipped.duplicate += 1;
      continue;
    }
    seen.add(phone);
    recipients.push({ customerId: c.id, phone, name: c.name });
  }
  return { recipients, skipped, matched: customers.length };
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "there";
}

/** One recipient's values for {{1}}, {{2}}… */
function valuesFor(store, mapping, r) {
  return (Array.isArray(mapping) ? mapping : []).map((v) => {
    switch (v?.source) {
      case "customer.first_name":
        return firstName(r.name);
      case "customer.name":
        return r.name || "there";
      case "store.name":
        return store.name;
      case "store.url":
        return storefrontUrl(store);
      default:
        return String(v?.value ?? "");
    }
  });
}

async function templateOrThrow(prisma, store, name, language) {
  const tpl = (await service.templates(prisma, store)).find((t) => t.name === name && t.language === language);
  if (!tpl) throw new HttpError(400, "That template no longer exists in your WhatsApp account.");
  if (tpl.status !== "APPROVED") throw new HttpError(400, `"${tpl.name}" isn't approved by Meta (${String(tpl.status).toLowerCase()}).`);
  if (tpl.urlButtonVariable >= 0) throw new HttpError(400, `"${tpl.name}" has a per-customer link in its button, which a broadcast can't fill. Use a template with a fixed link.`);
  return tpl;
}

const input = (body) => ({
  name: String(body.name || "").trim().slice(0, 120) || "Broadcast",
  templateName: String(body.templateName || ""),
  templateLanguage: String(body.templateLanguage || ""),
  variables: Array.isArray(body.variables) ? body.variables.slice(0, 20).map((v) => ({ source: String(v?.source || "text"), value: String(v?.value ?? "").slice(0, 500) })) : [],
  headerMediaUrl: body.headerMediaUrl ? String(body.headerMediaUrl).slice(0, 1000) : null,
  audience: { segment: SEGMENTS[body.audience?.segment] ? body.audience.segment : "consented", days: Number(body.audience?.days) || undefined, minOrders: Number(body.audience?.minOrders) || undefined },
});

/** Preview: counts, a sample of the actual messages, the estimate and the
 * number's daily limit. Nothing is sent. */
async function preview(prisma, store, body) {
  const b = input(body);
  const tpl = await templateOrThrow(prisma, store, b.templateName, b.templateLanguage);
  const { recipients, skipped, matched } = await resolveRecipients(prisma, store, b.audience);
  const price = service.pricePerMessage(tpl.category);
  let limit = null;
  try {
    const h = await cloud.health(prisma, store);
    limit = h.number?.limitTier ? LIMIT_TIER[h.number.limitTier] ?? null : null;
  } catch {
    // health is advisory here
  }
  const sample = recipients.slice(0, 3).map((r) => ({ to: r.name || r.phone, text: service.renderTemplateText(tpl, valuesFor(store, b.variables, r)) }));
  return {
    template: { name: tpl.name, language: tpl.language, category: tpl.category },
    matched,
    recipients: recipients.length,
    skipped,
    sample,
    pricePerMessage: price,
    estimatedCost: Math.round(recipients.length * price * 100) / 100,
    dailyLimit: Number.isFinite(limit) ? limit : null,
    overLimit: Number.isFinite(limit) && recipients.length > limit,
  };
}

async function save(prisma, store, body, user, id) {
  const b = input(body);
  const data = { ...b, createdById: user?.id || null, createdByName: user?.name || user?.email || null };
  if (id) {
    const existing = await prisma.whatsappBroadcast.findFirst({ where: { id, storeId: store.id } });
    if (!existing) throw new HttpError(404, "Broadcast not found");
    if (!["draft", "scheduled"].includes(existing.status)) throw new HttpError(400, "This broadcast has already been sent.");
    return prisma.whatsappBroadcast.update({ where: { id }, data: { ...b } });
  }
  return prisma.whatsappBroadcast.create({ data: { storeId: store.id, ...data } });
}

/** One test message to the seller's own number (not counted). */
async function testSend(prisma, store, body, phone) {
  const b = input(body);
  const to = toE164(phone);
  if (!to) throw new HttpError(400, "Enter your mobile number with country code.");
  const tpl = await templateOrThrow(prisma, store, b.templateName, b.templateLanguage);
  const values = valuesFor(store, b.variables, { name: "Test customer", phone: to });
  const components = service.templateComponents(tpl, { body: values, headerMediaUrl: b.headerMediaUrl });
  const { message } = await service.deliver(prisma, store, {
    phone: to,
    payload: { type: "template", template: { name: tpl.name, language: { code: tpl.language }, components } },
    record: { kind: "template", messageType: "template", templateName: tpl.name, templateLanguage: tpl.language, body: `[Test] ${service.renderTemplateText(tpl, values)}`, source: "broadcast" },
  });
  return { ok: true, messageId: message.providerMessageId };
}

/** Send now or at `scheduledAt`. Validates everything first. */
async function schedule(prisma, store, id, { scheduledAt, confirm }) {
  const bc = await prisma.whatsappBroadcast.findFirst({ where: { id, storeId: store.id } });
  if (!bc) throw new HttpError(404, "Broadcast not found");
  if (!["draft", "scheduled"].includes(bc.status)) throw new HttpError(400, "This broadcast has already been sent.");
  if (!confirm) throw new HttpError(400, "Confirm the send.");
  const tpl = await templateOrThrow(prisma, store, bc.templateName, bc.templateLanguage);
  service.templateComponents(tpl, { body: valuesFor(store, bc.variables, { name: "x" }), headerMediaUrl: bc.headerMediaUrl }); // checks variables
  const when = scheduledAt ? new Date(scheduledAt) : new Date();
  if (Number.isNaN(when.getTime())) throw new HttpError(400, "Choose a valid date and time.");
  if (scheduledAt && when < new Date(Date.now() - 60 * 1000)) throw new HttpError(400, "Choose a time in the future.");
  return prisma.whatsappBroadcast.update({
    where: { id },
    data: { status: "scheduled", scheduledAt: when, templateCategory: tpl.category, pricePerMessage: service.pricePerMessage(tpl.category), error: null },
  });
}

async function cancel(prisma, store, id) {
  const bc = await prisma.whatsappBroadcast.findFirst({ where: { id, storeId: store.id } });
  if (!bc) throw new HttpError(404, "Broadcast not found");
  if (!["draft", "scheduled", "sending"].includes(bc.status)) throw new HttpError(400, "It has already finished.");
  await prisma.whatsappBroadcastRecipient.updateMany({ where: { broadcastId: id, status: "queued" }, data: { status: "skipped", skipReason: "Cancelled" } });
  return prisma.whatsappBroadcast.update({ where: { id }, data: { status: "cancelled", finishedAt: new Date() } });
}

const RATE_LIMITED = /\b(130429|131048|131056|80007)\b|rate limit|spam rate|throughput/i;

/** Jobs tick: starts due broadcasts and sends the next batch of each. */
async function processDue(prisma, { log, budgetMs = 40 * 1000 } = {}) {
  const startedAt = Date.now();
  const due = await prisma.whatsappBroadcast.findMany({ where: { status: { in: ["scheduled", "sending"] }, scheduledAt: { lte: new Date() } }, orderBy: { scheduledAt: "asc" }, take: 5, include: { store: true } });
  let sent = 0;
  for (const bc of due) {
    const store = bc.store;
    try {
      if (bc.status === "scheduled") {
        // Claim it, then fix the recipient list at send time.
        const { count } = await prisma.whatsappBroadcast.updateMany({ where: { id: bc.id, status: "scheduled" }, data: { status: "sending", startedAt: new Date() } });
        if (!count) continue;
        const { recipients, skipped } = await resolveRecipients(prisma, store, bc.audience);
        await prisma.whatsappBroadcastRecipient.createMany({ data: recipients.map((r) => ({ broadcastId: bc.id, storeId: store.id, customerId: r.customerId, phone: r.phone, name: r.name })), skipDuplicates: true });
        const skippedTotal = skipped.noConsent + skipped.noPhone + skipped.optedOut + skipped.duplicate;
        await prisma.whatsappBroadcast.update({ where: { id: bc.id }, data: { recipients: recipients.length, skipped: skippedTotal } });
      }
      const conn = await cloud.connectionOrThrow(prisma, store.id);
      const tpl = await templateOrThrow(prisma, store, bc.templateName, bc.templateLanguage);
      for (;;) {
        if (Date.now() - startedAt > budgetMs) return sent;
        const batch = await prisma.whatsappBroadcastRecipient.findMany({ where: { broadcastId: bc.id, status: "queued" }, take: 20 });
        if (!batch.length) {
          await prisma.whatsappBroadcast.update({ where: { id: bc.id }, data: { status: "sent", finishedAt: new Date() } });
          break;
        }
        let paused = false;
        for (const r of batch) {
          // Opted out since it was scheduled?
          if (await service.optedOut(prisma, store.id, r.phone)) {
            await prisma.whatsappBroadcastRecipient.update({ where: { id: r.id }, data: { status: "skipped", skipReason: "Opted out" } });
            await prisma.whatsappBroadcast.update({ where: { id: bc.id }, data: { skipped: { increment: 1 }, recipients: { decrement: 1 } } });
            continue;
          }
          const values = valuesFor(store, bc.variables, r);
          try {
            const res = await service.deliver(prisma, store, {
              conn,
              phone: r.phone,
              dedupeKey: `bc:${bc.id}:${r.phone}`,
              payload: { type: "template", template: { name: tpl.name, language: { code: tpl.language }, components: service.templateComponents(tpl, { body: values, headerMediaUrl: bc.headerMediaUrl }) } },
              record: { kind: "template", messageType: "template", templateName: tpl.name, templateLanguage: tpl.language, body: service.renderTemplateText(tpl, values), source: "broadcast", broadcastId: bc.id, customerId: r.customerId },
            });
            if (res.duplicate) {
              await prisma.whatsappBroadcastRecipient.update({ where: { id: r.id }, data: { status: "skipped", skipReason: "Already sent" } });
              continue;
            }
            await prisma.whatsappBroadcastRecipient.update({ where: { id: r.id }, data: { status: "sent", sentAt: new Date(), providerMessageId: res.message.providerMessageId } });
            await prisma.whatsappBroadcast.update({ where: { id: bc.id }, data: { sent: { increment: 1 } } });
            sent += 1;
          } catch (err) {
            if (RATE_LIMITED.test(`${err.details?.meta?.code || ""} ${err.message}`)) {
              // Meta's limit: leave the rest queued; the next tick carries on.
              paused = true;
              await prisma.whatsappBroadcast.update({ where: { id: bc.id }, data: { error: `Paused by Meta's sending limit: ${err.message}. It continues automatically.`, scheduledAt: new Date(Date.now() + 15 * 60 * 1000) } });
              break;
            }
            await prisma.whatsappBroadcastRecipient.update({ where: { id: r.id }, data: { status: "failed", error: err.message } });
            await prisma.whatsappBroadcast.update({ where: { id: bc.id }, data: { failed: { increment: 1 } } });
            if (err.details?.reason === "meta_expired") throw err;
          }
        }
        if (paused) break;
      }
    } catch (err) {
      log?.warn({ err, broadcastId: bc.id }, "whatsapp broadcast failed");
      await prisma.whatsappBroadcast.update({ where: { id: bc.id }, data: { status: "failed", error: err.message, finishedAt: new Date() } });
    }
  }
  return sent;
}

/** Orders from recipients within 7 days of their message — store data,
 * counted the first time someone looks after a send. */
async function conversions(prisma, storeId, bc) {
  const recips = await prisma.whatsappBroadcastRecipient.findMany({ where: { broadcastId: bc.id, sentAt: { not: null }, customerId: { not: null } }, select: { customerId: true, sentAt: true } });
  if (!recips.length) return { orders: 0, revenue: 0 };
  const firstSent = recips.reduce((m, r) => (r.sentAt < m ? r.sentAt : m), recips[0].sentAt);
  const orders = await prisma.order.findMany({
    where: { storeId, customerId: { in: recips.map((r) => r.customerId) }, cancelledAt: null, createdAt: { gte: firstSent, lte: new Date(firstSent.getTime() + 8 * 24 * 3600 * 1000) } },
    select: { customerId: true, total: true, createdAt: true },
  });
  const sentAt = Object.fromEntries(recips.map((r) => [r.customerId, r.sentAt]));
  const counted = orders.filter((o) => o.createdAt >= sentAt[o.customerId] && o.createdAt - sentAt[o.customerId] <= 7 * 24 * 3600 * 1000);
  return { orders: counted.length, revenue: counted.reduce((s, o) => s + Number(o.total), 0) };
}

async function list(prisma, storeId) {
  return prisma.whatsappBroadcast.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 100 });
}

async function get(prisma, store, id) {
  const bc = await prisma.whatsappBroadcast.findFirst({ where: { id, storeId: store.id } });
  if (!bc) throw new HttpError(404, "Broadcast not found");
  if (["sending", "sent"].includes(bc.status)) {
    const conv = await conversions(prisma, store.id, bc);
    if (conv.orders !== bc.orders) await prisma.whatsappBroadcast.update({ where: { id }, data: { orders: conv.orders, revenue: conv.revenue } });
    Object.assign(bc, conv);
  }
  const [byStatus, failures] = await Promise.all([
    prisma.whatsappBroadcastRecipient.groupBy({ by: ["status"], where: { broadcastId: id }, _count: true }),
    prisma.whatsappBroadcastRecipient.findMany({ where: { broadcastId: id, status: { in: ["failed", "skipped"] } }, select: { phone: true, name: true, status: true, error: true, skipReason: true }, take: 50 }),
  ]);
  return { broadcast: bc, byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count])), problems: failures };
}

module.exports = { SEGMENTS, VARIABLE_SOURCES, LIMIT_TIER, resolveRecipients, preview, save, testSend, schedule, cancel, processDue, list, get, valuesFor };
