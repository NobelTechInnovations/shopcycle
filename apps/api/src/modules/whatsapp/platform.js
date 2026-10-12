const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const { encryptSecret, decryptSecret } = require("../../lib/crypto");
const meta = require("../meta/service");
const standard = require("./standard-templates");

/**
 * Oyklane's own WhatsApp number — the default sender. Stores that haven't
 * connected their own number send their order updates from it (with the
 * store's name in every message); a store that connects its own number
 * sends from that instead. Set up once in Super admin ▸ Messaging with a
 * permanent System User token from Oyklane's Business Manager.
 *
 * Stored in platform_settings "whatsapp.platform" (the token encrypted):
 *   { token, wabaId, wabaName, phoneNumberId, phoneNumberLabel, connectedAt,
 *     activatedAt, subscribedAt,
 *     notifications: { enabled, events: { orderConfirmed, shipped, delivered } } }
 */

const KEY = "whatsapp.platform";
let cache = { at: 0, value: null };

async function load(prisma, { fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < 60 * 1000) return cache.value;
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  cache = { at: Date.now(), value: row?.value || {} };
  return cache.value;
}

async function save(prisma, patch, actor) {
  const current = await load(prisma, { fresh: true });
  const value = { ...current, ...patch };
  await prisma.platformSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: actor || null }, create: { key: KEY, value, updatedBy: actor || null } });
  cache = { at: Date.now(), value };
  return value;
}

/** A connection-shaped object for whatsapp/cloud.js, or null. */
async function connection(prisma) {
  const v = await load(prisma);
  if (v.token && v.phoneNumberId) return { platform: true, accessToken: decryptSecret(v.token), waAccessToken: null, phoneNumberId: v.phoneNumberId, wabaId: v.wabaId || null, phoneNumberLabel: v.phoneNumberLabel || null };
  // The older setup: a token and number in Railway variables.
  if (env.META_WHATSAPP_TOKEN && env.META_WHATSAPP_PHONE_NUMBER_ID) return { platform: true, accessToken: env.META_WHATSAPP_TOKEN, waAccessToken: null, phoneNumberId: env.META_WHATSAPP_PHONE_NUMBER_ID, wabaId: env.META_WHATSAPP_WABA_ID || null, phoneNumberLabel: null };
  return null;
}

/** Super admin pasted a System User token: check it, list what it can use. */
async function useToken(prisma, token, actor) {
  const t = String(token || "").trim();
  if (t.length < 40) throw new HttpError(400, "Paste the System User access token (it's long — usually 200+ characters).");
  if (env.META_APP_ID && env.META_APP_SECRET) {
    const dbg = await meta.graphRequest("/debug_token", { token: `${env.META_APP_ID}|${env.META_APP_SECRET}`, params: { input_token: t } });
    if (!dbg.data?.is_valid) throw new HttpError(400, "Meta says this token isn't valid.");
    const scopes = dbg.data.scopes || [];
    if (!scopes.includes("whatsapp_business_messaging") || !scopes.includes("whatsapp_business_management")) {
      throw new HttpError(400, "The token needs the whatsapp_business_management and whatsapp_business_messaging permissions. Generate it again with both ticked.");
    }
  }
  const wabas = await meta.listWabas(t, []);
  await save(prisma, { token: encryptSecret(t), connectedAt: new Date().toISOString() }, actor);
  return { wabas };
}

async function choose(prisma, { wabaId, phoneNumberId }, actor) {
  const v = await load(prisma, { fresh: true });
  if (!v.token) throw new HttpError(400, "Add the token first.");
  const token = decryptSecret(v.token);
  const n = await meta.graphRequest(`/${phoneNumberId}`, { token, params: { fields: meta.WABA_NUMBER_FIELDS } });
  const waba = await meta.graphRequest(`/${wabaId}`, { token, params: { fields: "id,name" } }).catch(() => ({ id: wabaId, name: null }));
  const shaped = meta.shapeNumber(n);
  return save(prisma, { wabaId, wabaName: waba.name || null, phoneNumberId, phoneNumberLabel: shaped.label }, actor);
}

async function activate(prisma, pin, actor) {
  const conn = await connection(prisma);
  if (!conn) throw new HttpError(400, "Connect Oyklane's number first.");
  if (!/^\d{6}$/.test(String(pin || ""))) throw new HttpError(400, "Enter the 6-digit PIN.");
  await meta.graphRequest(`/${conn.phoneNumberId}/register`, { method: "POST", token: conn.accessToken, body: { messaging_product: "whatsapp", pin: String(pin) } });
  if (conn.wabaId) await meta.graphRequest(`/${conn.wabaId}/subscribed_apps`, { method: "POST", token: conn.accessToken });
  return save(prisma, { activatedAt: new Date().toISOString(), subscribedAt: new Date().toISOString() }, actor);
}

/**
 * Everything Super admin ▸ Messaging shows: Oyklane's number, and the
 * one-time Meta app setup (webhook, verify token, Embedded Signup) that
 * makes WhatsApp work for every store.
 */
async function status(prisma) {
  const v = await load(prisma, { fresh: true });
  const conn = await connection(prisma);
  const out = {
    source: v.token ? "settings" : conn ? "env" : null,
    wabaId: conn?.wabaId || null,
    wabaName: v.wabaName || null,
    phoneNumberId: conn?.phoneNumberId || null,
    number: null,
    subscribed: null,
    notifications: v.notifications || { enabled: false, events: { orderConfirmed: true, shipped: true, delivered: true } },
    setup: [],
  };
  const step = (key, ok, text, fix) => out.setup.push({ key, ok, text, fix: ok ? null : fix || null });
  step("app", Boolean(env.META_APP_ID && env.META_APP_SECRET), "Meta app id and secret on the server", "Set META_APP_ID and META_APP_SECRET on Railway.");
  step("verify_token", Boolean(env.META_WEBHOOK_VERIFY_TOKEN), "Webhook verify token on the server", "Set META_WEBHOOK_VERIFY_TOKEN on Railway to the same text you type as \"Verify token\" in the Meta app.");
  // Meta's own record of the webhook: is the app subscribed, to which URL and fields?
  if (env.META_APP_ID && env.META_APP_SECRET) {
    try {
      const subs = await meta.graphRequest(`/${env.META_APP_ID}/subscriptions`, { token: `${env.META_APP_ID}|${env.META_APP_SECRET}` });
      const wa = (subs.data || []).find((s) => s.object === "whatsapp_business_account");
      const fields = (wa?.fields || []).map((f) => f.name || f);
      const want = ["messages", "message_template_status_update"];
      const expected = `${String(env.API_PUBLIC_URL).replace(/\/$/, "")}/api/webhooks/meta/whatsapp`;
      step("webhook", Boolean(wa?.active), wa ? `Meta sends WhatsApp events to ${wa.callback_url}` : "Meta isn't sending WhatsApp events to Oyklane yet", `In the Meta app: WhatsApp ▸ Configuration ▸ Webhook ▸ Edit — Callback URL ${expected}, the same verify token, then Verify and save.`);
      if (wa) step("webhook_fields", want.every((f) => fields.includes(f)), `Subscribed to: ${fields.join(", ") || "nothing"}`, "Under Webhook fields, click Subscribe next to messages and message_template_status_update.");
      if (wa && wa.callback_url !== expected) step("webhook_url", false, `The callback URL is ${wa.callback_url}`, `Change it to ${expected}.`);
    } catch (err) {
      step("webhook", false, `Couldn't read the Meta app's webhook: ${err.message}`);
    }
  }
  step("signup", Boolean(env.META_WA_SIGNUP_CONFIG_ID), "Embedded Signup set up (sellers add numbers in Meta's popup)", "Optional: create a \"WhatsApp Embedded Signup\" configuration and set META_WA_SIGNUP_CONFIG_ID.");
  if (conn) {
    try {
      out.number = meta.shapeNumber(await meta.graphRequest(`/${conn.phoneNumberId}`, { token: conn.accessToken, params: { fields: meta.WABA_NUMBER_FIELDS } }));
    } catch (err) {
      out.numberError = err.message;
    }
    if (conn.wabaId) {
      try {
        const r = await meta.graphRequest(`/${conn.wabaId}/subscribed_apps`, { token: conn.accessToken });
        out.subscribed = (r.data || []).some((a) => String(a.whatsapp_business_api_data?.id || a.id) === String(env.META_APP_ID));
      } catch {
        out.subscribed = null;
      }
    }
  }
  return out;
}

/** Puts the standard templates on a WhatsApp account (skips ones it has). */
async function installStandard(conn, { linkBase, withOtp = false } = {}) {
  const cloud = require("./cloud");
  const service = require("./service");
  const have = new Set((await cloud.listTemplates(conn, { fresh: true })).map((t) => t.name));
  const results = [];
  for (const kind of Object.keys(standard.KINDS)) {
    const name = standard.KINDS[kind].name;
    if (have.has(name)) {
      results.push({ name, status: "exists" });
      continue;
    }
    try {
      const out = await cloud.createTemplate(conn, service.buildTemplate(standard.builderInput(kind, { linkBase })));
      results.push({ name, status: out.status || "PENDING" });
    } catch (err) {
      results.push({ name, status: "error", error: err.message });
    }
  }
  if (withOtp && !have.has(standard.OTP_TEMPLATE)) {
    try {
      const out = await cloud.createTemplate(conn, standard.otpSpec());
      results.push({ name: standard.OTP_TEMPLATE, status: out.status || "PENDING" });
    } catch (err) {
      results.push({ name: standard.OTP_TEMPLATE, status: "error", error: err.message });
    }
  }
  return results;
}

module.exports = { KEY, load, save, connection, useToken, choose, activate, status, installStandard };
