const { HttpError } = require("@shopcycle/utils");
const { encryptSecret, decryptSecret } = require("../../lib/crypto");
const { PROVIDERS, PROVIDER_KEYS } = require("./providers");

/**
 * Settings ▸ Payments: which gateways a seller has connected, and cash on
 * delivery. Credentials are one encrypted JSON blob per gateway and are
 * never sent back to the browser — secrets come back as "saved, ending …".
 */

function readCreds(row) {
  try {
    return JSON.parse(decryptSecret(row.credentials) || "{}");
  } catch {
    return {};
  }
}

const mask = (v) => (v ? `•••• ${String(v).slice(-4)}` : "");

function codEnabled(store) {
  const s = store.settings && typeof store.settings === "object" ? store.settings : {};
  return s.codEnabled !== false;
}

/** For the admin: every gateway, connected or not, with safe-to-show values. */
async function listForAdmin(prisma, store) {
  const rows = await prisma.paymentProvider.findMany({ where: { storeId: store.id } });
  return {
    cod: { enabled: codEnabled(store) },
    providers: PROVIDER_KEYS.map((key) => {
      const p = PROVIDERS[key];
      const row = rows.find((r) => r.provider === key);
      const creds = row ? readCreds(row) : {};
      return {
        key,
        name: p.name,
        blurb: p.blurb,
        docs: p.docs,
        currencies: p.currencies,
        connected: Boolean(row),
        enabled: Boolean(row?.enabled),
        testMode: row ? row.testMode : true,
        fields: p.fields.map((f) => ({
          ...f,
          value: f.secret ? "" : creds[f.key] || "",
          saved: f.secret ? mask(creds[f.key]) : undefined,
        })),
        updatedAt: row?.updatedAt || null,
      };
    }),
  };
}

/** Saves a gateway. Secret fields left empty keep their saved value, so a
 * seller can flip test mode without re-typing the secret. The keys are
 * checked with the gateway before anything is saved. */
async function save(prisma, store, key, input) {
  const p = PROVIDERS[key];
  if (!p) throw new HttpError(404, "Unknown payment provider");
  const row = await prisma.paymentProvider.findUnique({ where: { storeId_provider: { storeId: store.id, provider: key } } });
  const current = row ? readCreds(row) : {};
  const creds = {};
  for (const f of p.fields) {
    const incoming = String(input.credentials?.[f.key] ?? "").trim();
    creds[f.key] = incoming || current[f.key] || "";
    if (!creds[f.key]) throw new HttpError(400, `Enter the ${f.label}.`);
  }
  const testMode = input.testMode !== undefined ? Boolean(input.testMode) : row ? row.testMode : true;
  const enabled = input.enabled !== undefined ? Boolean(input.enabled) : row ? row.enabled : true;
  if (enabled && p.currencies && !p.currencies.includes(store.currency || "INR")) {
    throw new HttpError(400, `${p.name} can't take payments in ${store.currency}. Supported: ${p.currencies.join(", ")}.`);
  }
  await p.check(creds, testMode);
  const data = { enabled, testMode, credentials: encryptSecret(JSON.stringify(creds)) };
  await prisma.paymentProvider.upsert({
    where: { storeId_provider: { storeId: store.id, provider: key } },
    create: { storeId: store.id, provider: key, ...data },
    update: data,
  });
  return listForAdmin(prisma, store);
}

async function setEnabled(prisma, store, key, enabled) {
  const row = await prisma.paymentProvider.findUnique({ where: { storeId_provider: { storeId: store.id, provider: key } } });
  if (!row) throw new HttpError(404, "Connect this gateway first.");
  await prisma.paymentProvider.update({ where: { id: row.id }, data: { enabled: Boolean(enabled) } });
  return listForAdmin(prisma, store);
}

async function remove(prisma, store, key) {
  await prisma.paymentProvider.deleteMany({ where: { storeId: store.id, provider: key } });
  return listForAdmin(prisma, store);
}

async function setCod(prisma, store, enabled) {
  const settings = { ...(store.settings && typeof store.settings === "object" ? store.settings : {}), codEnabled: Boolean(enabled) };
  const updated = await prisma.store.update({ where: { id: store.id }, data: { settings } });
  return listForAdmin(prisma, updated);
}

/** What checkout offers: cash on delivery (if on) and each enabled gateway. */
async function checkoutMethods(prisma, store) {
  const rows = await prisma.paymentProvider.findMany({ where: { storeId: store.id, enabled: true }, orderBy: { createdAt: "asc" } });
  const methods = [];
  if (codEnabled(store)) methods.push({ value: "cod", label: "Cash on delivery" });
  for (const r of rows) {
    const p = PROVIDERS[r.provider];
    if (p) methods.push({ value: r.provider, label: p.name, testMode: r.testMode });
  }
  return methods;
}

/** A gateway's decrypted config, for starting or confirming a payment. */
async function gateway(prisma, storeId, key) {
  const row = await prisma.paymentProvider.findUnique({ where: { storeId_provider: { storeId, provider: key } } });
  if (!row || !PROVIDERS[key]) return null;
  return { provider: PROVIDERS[key], creds: readCreds(row), test: row.testMode, enabled: row.enabled };
}

module.exports = { listForAdmin, save, setEnabled, remove, setCod, checkoutMethods, gateway, codEnabled };
