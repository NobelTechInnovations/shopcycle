const crypto = require("crypto");
const dns = require("dns").promises;
const net = require("net");
const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { encryptSecret, decryptSecret } = require("../../lib/crypto");
const serialize = require("./serializers");

/**
 * Outgoing webhooks: a seller registers a URL and the events they care
 * about; we POST a JSON body to it, signed with the endpoint's secret:
 *
 *   X-Oyklane-Event:      order.paid
 *   X-Oyklane-Delivery:   <delivery id>
 *   X-Oyklane-Timestamp:  <unix seconds>
 *   X-Oyklane-Signature:  sha256=<hex HMAC-SHA256 of "<timestamp>.<body>">
 *
 * A 2xx within 10 seconds is success; anything else is retried with
 * backoff (1m, 5m, 30m, 2h, 6h) and then marked failed. Deliveries to
 * private or internal addresses are refused.
 */

const EVENTS = [
  { key: "order.created", label: "Order created", group: "Orders" },
  { key: "order.paid", label: "Order paid", group: "Orders" },
  { key: "order.fulfilled", label: "Order shipped", group: "Orders" },
  { key: "order.cancelled", label: "Order cancelled", group: "Orders" },
  { key: "order.refunded", label: "Order refunded", group: "Orders" },
  { key: "product.created", label: "Product created", group: "Products" },
  { key: "product.updated", label: "Product updated", group: "Products" },
  { key: "product.deleted", label: "Product deleted", group: "Products" },
  { key: "customer.created", label: "Customer created", group: "Customers" },
];
const EVENT_KEYS = EVENTS.map((e) => e.key);
const BACKOFF_S = [60, 300, 1800, 7200, 21600];
const MAX_ATTEMPTS = BACKOFF_S.length + 1;

const ORDER_INCLUDE = { customer: true, items: true, fulfillments: true, refunds: true };
const PRODUCT_INCLUDE = { variants: true, images: { orderBy: { position: "asc" } }, brand: true, category: true };

// ── Safety: no deliveries into our own network ──────────────────────
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "Enter a full URL, like https://example.com/webhooks.");
  }
  const local = env.NODE_ENV !== "production";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new HttpError(400, "Webhook URLs must use https://.");
  if (local) return url;
  const addrs = net.isIP(url.hostname) ? [url.hostname] : (await dns.lookup(url.hostname, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length) throw new HttpError(400, `${url.hostname} doesn't resolve.`);
  if (addrs.some(privateIp)) throw new HttpError(400, "Webhooks can't be sent to private or internal addresses.");
  return url;
}

// ── Payloads ─────────────────────────────────────────────────────────
async function payloadFor(prisma, event, subject) {
  const [kind] = event.split(".");
  if (kind === "order") {
    const o = subject.items ? subject : await prisma.order.findUnique({ where: { id: subject.id }, include: ORDER_INCLUDE });
    return o ? serialize.order(o) : null;
  }
  if (kind === "product") {
    if (event === "product.deleted") return { id: subject.id, title: subject.title || null };
    const p = await prisma.product.findUnique({ where: { id: subject.id }, include: PRODUCT_INCLUDE });
    return p ? serialize.product(p) : null;
  }
  if (kind === "customer") {
    const c = await prisma.customer.findUnique({ where: { id: subject.id } });
    return c ? serialize.customer(c) : null;
  }
  return subject;
}

// ── Sending ─────────────────────────────────────────────────────────
async function attempt(prisma, delivery, endpoint) {
  const body = JSON.stringify({ id: delivery.id, event: delivery.event, created_at: delivery.createdAt, data: delivery.payload });
  const ts = Math.floor(Date.now() / 1000);
  const secret = decryptSecret(endpoint.secret);
  const signature = crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  let status = null;
  let error = null;
  try {
    await assertPublicUrl(endpoint.url);
    const res = await fetch(endpoint.url, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        "user-agent": "Oyklane-Webhooks/1.0",
        "x-oyklane-event": delivery.event,
        "x-oyklane-delivery": delivery.id,
        "x-oyklane-timestamp": String(ts),
        "x-oyklane-signature": `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    status = res.status;
    if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err.name === "TimeoutError" ? "Timed out after 10s" : err.message;
  }
  const attempts = delivery.attempts + 1;
  const ok = !error;
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      attempts,
      responseStatus: status,
      lastError: error,
      status: ok ? "success" : attempts >= MAX_ATTEMPTS ? "failed" : "pending",
      deliveredAt: ok ? new Date() : null,
      nextAttemptAt: new Date(Date.now() + (BACKOFF_S[attempts - 1] || 0) * 1000),
    },
  });
  return ok;
}

/** Records the event for every endpoint that wants it and tries to deliver
 * straight away (in the background). Never throws into the caller — a
 * webhook problem must not break checkout or an admin action. */
function emit(prisma, storeId, event, subject) {
  setImmediate(async () => {
    try {
      const endpoints = await prisma.webhookEndpoint.findMany({ where: { storeId, enabled: true, events: { has: event } } });
      if (!endpoints.length) return;
      const payload = await payloadFor(prisma, event, subject);
      if (!payload) return;
      for (const ep of endpoints) {
        const d = await prisma.webhookDelivery.create({ data: { endpointId: ep.id, event, payload } });
        await attempt(prisma, d, ep).catch(() => {});
      }
    } catch {
      /* swallowed — see doc comment */
    }
  });
}

/** Background job: retries that are due. */
async function processDue(prisma, { limit = 50 } = {}) {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "pending", attempts: { gt: 0 }, nextAttemptAt: { lte: new Date() } },
    include: { endpoint: true },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });
  let ok = 0;
  for (const d of due) if (d.endpoint.enabled && (await attempt(prisma, d, d.endpoint))) ok += 1;
  return { retried: due.length, ok };
}

// ── Admin ────────────────────────────────────────────────────────────
function publicEndpoint(ep) {
  return { id: ep.id, url: ep.url, events: ep.events, enabled: ep.enabled, createdAt: ep.createdAt, updatedAt: ep.updatedAt };
}

async function list(prisma, storeId) {
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { storeId }, orderBy: { createdAt: "asc" } });
  const recent = endpoints.length
    ? await prisma.webhookDelivery.findMany({
        where: { endpointId: { in: endpoints.map((e) => e.id) } },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, endpointId: true, event: true, status: true, attempts: true, responseStatus: true, lastError: true, createdAt: true, deliveredAt: true },
      })
    : [];
  return { events: EVENTS, endpoints: endpoints.map(publicEndpoint), deliveries: recent };
}

function validEvents(events) {
  const clean = [...new Set((events || []).filter((e) => EVENT_KEYS.includes(e)))];
  if (!clean.length) throw new HttpError(400, "Pick at least one event.");
  return clean;
}

async function create(prisma, storeId, { url, events }) {
  await assertPublicUrl(url);
  if ((await prisma.webhookEndpoint.count({ where: { storeId } })) >= 20) throw new HttpError(400, "A store can have up to 20 webhooks.");
  const secret = `whsec_${crypto.randomBytes(24).toString("base64url")}`;
  const ep = await prisma.webhookEndpoint.create({ data: { storeId, url, events: validEvents(events), secret: encryptSecret(secret) } });
  // The signing secret is shown once, here.
  return { endpoint: publicEndpoint(ep), secret };
}

async function update(prisma, storeId, id, input) {
  const ep = await prisma.webhookEndpoint.findFirst({ where: { id, storeId } });
  if (!ep) throw new HttpError(404, "Webhook not found");
  if (input.url) await assertPublicUrl(input.url);
  const updated = await prisma.webhookEndpoint.update({
    where: { id },
    data: {
      ...(input.url && { url: input.url }),
      ...(input.events && { events: validEvents(input.events) }),
      ...(input.enabled !== undefined && { enabled: Boolean(input.enabled) }),
    },
  });
  return publicEndpoint(updated);
}

async function remove(prisma, storeId, id) {
  const { count } = await prisma.webhookEndpoint.deleteMany({ where: { id, storeId } });
  if (!count) throw new HttpError(404, "Webhook not found");
}

/** "Send test": a `ping` event, delivered now, result returned. */
async function ping(prisma, storeId, id) {
  const ep = await prisma.webhookEndpoint.findFirst({ where: { id, storeId } });
  if (!ep) throw new HttpError(404, "Webhook not found");
  const d = await prisma.webhookDelivery.create({ data: { endpointId: ep.id, event: "ping", payload: { message: "Hello from Oyklane", store_id: storeId } } });
  await attempt(prisma, d, ep);
  return prisma.webhookDelivery.findUnique({ where: { id: d.id } });
}

async function redeliver(prisma, storeId, deliveryId) {
  const d = await prisma.webhookDelivery.findFirst({ where: { id: deliveryId, endpoint: { storeId } }, include: { endpoint: true } });
  if (!d) throw new HttpError(404, "Delivery not found");
  const fresh = await prisma.webhookDelivery.create({ data: { endpointId: d.endpointId, event: d.event, payload: d.payload } });
  await attempt(prisma, fresh, d.endpoint);
  return prisma.webhookDelivery.findUnique({ where: { id: fresh.id } });
}

module.exports = { EVENTS, EVENT_KEYS, emit, processDue, list, create, update, remove, ping, redeliver, ORDER_INCLUDE, PRODUCT_INCLUDE };
