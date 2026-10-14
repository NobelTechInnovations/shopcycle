const { env } = require("../config/env");
const { encryptSecret, decryptSecret } = require("./crypto");

/**
 * The platform's Zoho CPaaS WhatsApp setup, shared by every store — the
 * account (API key, sending number, data centre) and the approved template
 * for each kind of message. Set in Super admin ▸ Messaging, kept in
 * platform_settings (the key encrypted); the older Railway variables
 * (ZOHO_CPAAS_TOKEN, ZOHO_WHATSAPP_FROM) are only a fallback.
 *
 * Each template maps its own placeholder names (chosen when it was approved
 * in Zoho) to what we fill in. Only the verification code is sent today;
 * order and delivery updates will join it as part of the Phone Login app.
 */
const KEY = "whatsapp_templates";
const TYPES = {
  otp: {
    label: "Verification code",
    hint: "Phone Login sign-in and the One-Click Checkout code.",
    vars: [{ key: "code", label: "The 6-digit code", example: "482913" }],
  },
};
const REFRESH_MS = 60 * 1000;

const ACCOUNT_KEY = "whatsapp_zoho";
const REGIONS = { in: "https://cpaas.zoho.in/v1.1", com: "https://cpaas.zoho.com/v1.1", eu: "https://cpaas.zoho.eu/v1.1" };

let cache = {};
let account = {}; // { token (encrypted), from, region, enabled }
let loadedAt = 0;

function clean(input) {
  const out = {};
  for (const [type, def] of Object.entries(TYPES)) {
    const t = input?.[type] || {};
    const vars = {};
    for (const v of def.vars) vars[v.key] = String(t.vars?.[v.key] || v.key).trim().slice(0, 60);
    out[type] = { templateKey: String(t.templateKey || "").trim().slice(0, 200), enabled: t.enabled !== false, vars };
  }
  return out;
}

async function load(prisma) {
  const [row, acct] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: KEY } }).catch(() => null),
    prisma.platformSetting.findUnique({ where: { key: ACCOUNT_KEY } }).catch(() => null),
  ]);
  cache = clean(row?.value);
  account = acct?.value || {};
  loadedAt = Date.now();
  return cache;
}

const envToken = () => String(env.ZOHO_CPAAS_TOKEN || env.ZEPTOMAIL_TOKEN || "").replace(/^Zoho-enczapikey\s+/i, "").trim();

/** The Zoho account WhatsApp codes go through: Super admin's, field by
 * field falling back to the Railway variables. Null when turned off. */
function zohoAccount() {
  if (account.enabled === false) return null;
  let token = null;
  if (account.token) {
    try {
      token = decryptSecret(account.token);
    } catch {
      token = null;
    }
  }
  const from = account.from || env.ZOHO_WHATSAPP_FROM || null;
  return {
    token: token || envToken() || null,
    from: from ? (from.startsWith("+") ? from : `+${from}`) : null,
    apiUrl: account.region ? REGIONS[account.region] || REGIONS.in : env.ZOHO_CPAAS_API_URL,
    keyFrom: token ? "super_admin" : envToken() ? "env" : null,
  };
}

/** What Super admin sees — never the key. */
function accountSummary() {
  return { keySaved: Boolean(account.token), from: account.from || null, region: account.region || null, enabled: account.enabled !== false, envFallback: { key: Boolean(envToken()), from: env.ZOHO_WHATSAPP_FROM || null } };
}

/** `token` replaces the saved key (empty keeps it); `clearKey` removes it. */
async function saveAccount(prisma, { token, from, region, enabled, clearKey }, actor) {
  await load(prisma);
  const next = {
    ...account,
    from: String(from || "").replace(/[^\d+]/g, "").slice(0, 20) || null,
    region: REGIONS[region] ? region : "in",
    enabled: enabled !== false,
  };
  const key = String(token || "").replace(/^Zoho-enczapikey\s+/i, "").trim();
  if (key) next.token = encryptSecret(key);
  if (clearKey) delete next.token;
  await prisma.platformSetting.upsert({ where: { key: ACCOUNT_KEY }, update: { value: next, updatedBy: actor || null }, create: { key: ACCOUNT_KEY, value: next, updatedBy: actor || null } });
  account = next;
  loadedAt = Date.now();
  return accountSummary();
}

/** The last loaded templates (sync — messaging decides which channels work
 * without a database call). Refreshed in the background once a minute. */
function cached(prisma) {
  if (prisma && Date.now() - loadedAt > REFRESH_MS) {
    loadedAt = Date.now();
    load(prisma).catch(() => {});
  }
  return cache;
}

async function save(prisma, input, actor) {
  const value = clean(input);
  await prisma.platformSetting.upsert({
    where: { key: KEY },
    update: { value, updatedBy: actor || null },
    create: { key: KEY, value, updatedBy: actor || null },
  });
  cache = value;
  loadedAt = Date.now();
  return value;
}

/** The template for the verification code: Super admin's, else the older
 * ZOHO_WHATSAPP_TEMPLATE_KEY variable. Null when there's none (or it's off). */
function otpTemplate() {
  const t = cache.otp;
  if (t && t.templateKey) return t.enabled ? t : null;
  if (env.ZOHO_WHATSAPP_TEMPLATE_KEY) return { templateKey: env.ZOHO_WHATSAPP_TEMPLATE_KEY, enabled: true, vars: { code: env.ZOHO_WHATSAPP_MERGE_KEY } };
  return null;
}

module.exports = { TYPES, REGIONS, load, cached, save, otpTemplate, zohoAccount, accountSummary, saveAccount };
