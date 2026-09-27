const crypto = require("crypto");
const entitlements = require("../billing/entitlements");
const { computeAccess } = require("../billing/access");
const { HttpError } = require("@shopcycle/utils");

/**
 * API keys for a seller's own integrations. The token (oyk_…) is shown
 * once when created; only its SHA-256 is stored. Each key carries scopes;
 * a request can only do what its scopes allow.
 */
const SCOPES = [
  { key: "read_products", label: "Read products", group: "Products" },
  { key: "write_products", label: "Create, edit and delete products", group: "Products" },
  { key: "read_inventory", label: "Read stock levels", group: "Inventory" },
  { key: "write_inventory", label: "Change stock levels", group: "Inventory" },
  { key: "read_orders", label: "Read orders", group: "Orders" },
  { key: "write_orders", label: "Ship orders (add tracking)", group: "Orders" },
  { key: "read_customers", label: "Read customers", group: "Customers" },
];
const SCOPE_KEYS = SCOPES.map((s) => s.key);

const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");

function publicKey(k) {
  return { id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, lastUsedAt: k.lastUsedAt, createdAt: k.createdAt, createdBy: k.createdBy, revoked: Boolean(k.revokedAt) };
}

async function list(prisma, storeId) {
  const keys = await prisma.apiKey.findMany({ where: { storeId, revokedAt: null }, orderBy: { createdAt: "desc" } });
  return { scopes: SCOPES, keys: keys.map(publicKey) };
}

async function create(prisma, storeId, { name, scopes }, { actorName } = {}) {
  const clean = [...new Set((scopes || []).filter((s) => SCOPE_KEYS.includes(s)))];
  if (!clean.length) throw new HttpError(400, "Choose at least one permission.");
  if ((await prisma.apiKey.count({ where: { storeId, revokedAt: null } })) >= 25) throw new HttpError(400, "A store can have up to 25 active keys.");
  const token = `oyk_${crypto.randomBytes(24).toString("base64url")}`;
  const key = await prisma.apiKey.create({
    data: { storeId, name: String(name).trim().slice(0, 80), prefix: token.slice(0, 10), keyHash: hash(token), scopes: clean, createdBy: actorName || null },
  });
  return { key: publicKey(key), token };
}

async function revoke(prisma, storeId, id) {
  const { count } = await prisma.apiKey.updateMany({ where: { id, storeId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!count) throw new HttpError(404, "Key not found");
}

/** Fastify preHandler for /api/v1: resolves the key to its store and
 * checks the route's scope. `request.apiKey` / `request.store` are set. */
function requireScope(fastify, scope) {
  return async function checkApiKey(request, reply) {
    const header = String(request.headers.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : String(request.headers["x-oyklane-key"] || "").trim();
    if (!token.startsWith("oyk_")) return reply.code(401).send({ error: "Missing API key. Send it as: Authorization: Bearer oyk_…" });
    const key = await fastify.prisma.apiKey.findUnique({
      where: { keyHash: hash(token) },
      include: { store: { include: { subscription: { include: { plan: { include: { features: true } } } } } } },
    });
    if (!key || key.revokedAt) return reply.code(401).send({ error: "This API key isn't valid (it may have been revoked)." });
    if (key.store.status === "suspended") return reply.code(403).send({ error: "This store is suspended." });
    // The API is part of Pro (billing/catalog.js) and closes with the
    // dashboard when billing is overdue.
    const { subscription, ...store } = key.store;
    if (!computeAccess(subscription, { storeStatus: store.status }).dashboard) {
      return reply.code(402).send({ error: "This store's Oyklane subscription is overdue — the API is paused until it's paid." });
    }
    const ent = entitlements.compute(subscription?.plan || null, await entitlements.activeGrants(fastify.prisma, store.id));
    if (!entitlements.has(ent, "api_access")) {
      return reply.code(403).send({ error: "API access is part of the Pro plan. Upgrade in Settings ▸ Plan & billing.", code: "plan_upgrade_required" });
    }
    key.store = store;
    if (scope && !key.scopes.includes(scope)) return reply.code(403).send({ error: `This key doesn't have the ${scope} permission.` });
    request.apiKey = key;
    request.store = key.store;
    // Throttled bookkeeping: at most one write a minute per key.
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
      fastify.prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    }
  };
}

module.exports = { SCOPES, SCOPE_KEYS, list, create, revoke, requireScope };
