const { HttpError } = require("@shopcycle/utils");
const { encryptSecret, decryptSecret } = require("../../lib/crypto");
const { PROVIDERS, PROVIDER_KEYS } = require("./providers");
const methods = require("./methods");
const upi = require("../upi/service");

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
  // Which ways to pay these keys offer (UPI, cards, …) — shown at checkout.
  await refreshMethods(prisma, store.id, key, creds, testMode);
  return listForAdmin(prisma, store);
}

/** Asks the gateway what it offers and keeps the answer on the store
 * (settings.gatewayMethods), read fresh so other settings aren't lost. */
async function refreshMethods(prisma, storeId, key, creds, test, log) {
  const modes = await methods.discover(key, creds, test, log);
  const fresh = await prisma.store.findUnique({ where: { id: storeId }, select: { settings: true } });
  const settings = fresh?.settings && typeof fresh.settings === "object" ? fresh.settings : {};
  const gatewayMethods = { ...(settings.gatewayMethods || {}), [key]: { modes, test: Boolean(test), checkedAt: new Date().toISOString() } };
  await prisma.store.update({ where: { id: storeId }, data: { settings: { ...settings, gatewayMethods } } });
  return modes;
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
  if (await upi.activeSettings(prisma, store.id)) methods.push({ value: upi.METHOD, label: "UPI QR" });
  return methods;
}

const refreshing = new Set(); // gateways being asked right now (this process)

const OPTION_TEXT = {
  upi: { title: "UPI", subtitle: "Google Pay, PhonePe, Paytm or any UPI app", badges: ["GPay", "PhonePe", "Paytm"] },
  card: { title: "Credit or debit card", subtitle: "Visa, Mastercard, RuPay", badges: ["VISA", "Mastercard", "RuPay"] },
  netbanking: { title: "Net banking", subtitle: "All major Indian banks", badges: [] },
  wallet: { title: "Wallets", subtitle: "Paytm, PhonePe, Amazon Pay and more", badges: ["Paytm", "PhonePe", "Amazon Pay"] },
  emi: { title: "EMI", subtitle: "Easy instalments on cards", badges: [] },
  paylater: { title: "Pay later", subtitle: "Simpl, LazyPay and more", badges: [] },
  paypal: { title: "PayPal", subtitle: "PayPal balance or card", badges: ["PayPal"] },
  cod: { title: "Cash on delivery", subtitle: "Pay by cash or UPI when your order arrives", badges: [] },
};

/**
 * Checkout's ways to pay, one per method — UPI, card, net banking, wallets,
 * EMI, pay later (each from the first connected gateway that offers it),
 * then cash on delivery. `value` is the gateway, `mode` the method it's
 * asked to open on. A gateway not asked yet (or a day ago) is asked in the
 * background; until then its typical methods are shown.
 */
async function checkoutOptions(prisma, store, { log } = {}) {
  const rows = await prisma.paymentProvider.findMany({ where: { storeId: store.id, enabled: true }, orderBy: { createdAt: "asc" } });
  const known = (store.settings && store.settings.gatewayMethods) || {};
  const byMode = new Map();
  for (const r of rows) {
    if (!PROVIDERS[r.provider]) continue;
    const saved = known[r.provider];
    const fresh = saved && saved.test === r.testMode && Date.now() - new Date(saved.checkedAt).getTime() < methods.STALE_MS;
    const flight = `${store.id}:${r.provider}`;
    if (!fresh && !refreshing.has(flight)) {
      refreshing.add(flight);
      refreshMethods(prisma, store.id, r.provider, readCreds(r), r.testMode, log)
        .catch(() => {})
        .finally(() => refreshing.delete(flight));
    }
    const modes = saved?.modes?.length ? saved.modes : methods.DEFAULTS[r.provider] || [];
    for (const mode of modes) if (!byMode.has(mode)) byMode.set(mode, { value: r.provider, mode, testMode: r.testMode, gateway: PROVIDERS[r.provider].name });
  }
  const options = methods.MODES.filter((m) => byMode.has(m)).map((m) => ({ ...byMode.get(m), ...OPTION_TEXT[m], ...(m === "card" && byMode.get(m).value === "stripe" && { subtitle: "Visa, Mastercard, Amex", badges: ["VISA", "Mastercard", "Amex"] }) }));
  // UPI QR app: paid straight to the seller's UPI ID.
  const upiQr = await upi.checkoutOption(prisma, store.id);
  if (upiQr) options.push(upiQr);
  if (codEnabled(store)) options.push({ value: "cod", mode: "cod", testMode: false, gateway: null, ...OPTION_TEXT.cod });
  return options;
}

/** A gateway's decrypted config, for starting or confirming a payment. */
async function gateway(prisma, storeId, key) {
  const row = await prisma.paymentProvider.findUnique({ where: { storeId_provider: { storeId, provider: key } } });
  if (!row || !PROVIDERS[key]) return null;
  return { provider: PROVIDERS[key], creds: readCreds(row), test: row.testMode, enabled: row.enabled };
}

module.exports = { listForAdmin, save, setEnabled, remove, setCod, checkoutMethods, checkoutOptions, refreshMethods, gateway, codEnabled };
