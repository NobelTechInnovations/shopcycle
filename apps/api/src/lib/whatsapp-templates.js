const { env } = require("../config/env");

/**
 * The platform's approved WhatsApp templates (Zoho CPaaS), one per kind of
 * message, shared by every store — set in Super admin ▸ Messaging, kept in
 * platform_settings. Railway only holds the account (ZOHO_CPAAS_TOKEN) and
 * the sending number (ZOHO_WHATSAPP_FROM).
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

let cache = {};
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
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  cache = clean(row?.value);
  loadedAt = Date.now();
  return cache;
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

module.exports = { TYPES, load, cached, save, otpTemplate };
