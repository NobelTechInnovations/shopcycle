const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const meta = require("../meta/service");
const repository = require("../meta/repository");

/**
 * The WhatsApp Business Platform (Cloud API) for one store: which token
 * to use, the connected number's health, activating a number, Embedded
 * Signup, sending, templates and media. Everything here talks to Meta —
 * nothing reports success unless Meta's response says so.
 */

/** The token for WhatsApp calls: Embedded Signup's business token when
 * the seller used it, the Facebook login otherwise. */
const waToken = (conn) => conn.waAccessToken || conn.accessToken;

async function connectionOrThrow(prisma, storeId, { needNumber = true } = {}) {
  const conn = await repository.findByStore(prisma, storeId);
  if (!conn) throw new HttpError(400, "Connect WhatsApp first (Apps ▸ WhatsApp ▸ Connect).", { reason: "not_connected" });
  if (needNumber && !conn.phoneNumberId) throw new HttpError(400, "Choose your WhatsApp number first (Apps ▸ WhatsApp).", { reason: "no_number" });
  return conn;
}

/** Is Oyklane subscribed to this WhatsApp account's webhooks? */
async function subscribed(token, wabaId) {
  const r = await meta.graphRequest(`/${wabaId}/subscribed_apps`, { token });
  return (r.data || []).some((a) => String(a.whatsapp_business_api_data?.id || a.id) === String(env.META_APP_ID));
}

/** Everything the WhatsApp screen's "Connection health" card shows. Each
 * check is independent, so one failing (say, a missing permission) still
 * lets the others report. */
async function health(prisma, store) {
  const conn = await connectionOrThrow(prisma, store.id, { needNumber: false });
  const token = waToken(conn);
  const out = {
    wabaId: conn.wabaId,
    wabaName: conn.wabaName,
    phoneNumberId: conn.phoneNumberId,
    number: null,
    subscribed: null,
    webhookConfigured: Boolean(env.META_WEBHOOK_VERIFY_TOKEN),
    embeddedSignup: Boolean(conn.waAccessToken),
    tokenExpiresAt: conn.waAccessToken ? null : conn.tokenExpiresAt,
    checks: [],
  };
  const check = (key, ok, text, fix) => out.checks.push({ key, ok, text, fix: ok ? null : fix || null });

  if (!conn.tokenExpiresAt || conn.waAccessToken || new Date(conn.tokenExpiresAt) > new Date()) check("login", true, "Facebook connection is active");
  else check("login", false, "Your Facebook connection has expired", "Reconnect Facebook.");

  if (!conn.phoneNumberId) {
    check("number", false, "No WhatsApp number chosen", "Choose your number below, or add one with \"Add a WhatsApp number\".");
    return out;
  }
  try {
    const n = await meta.graphRequest(`/${conn.phoneNumberId}`, { token, params: { fields: meta.WABA_NUMBER_FIELDS } });
    out.number = meta.shapeNumber(n);
    if (out.number.ready) check("number", true, `${out.number.label} is live on the WhatsApp Cloud API`);
    else if (out.number.action === "activate") check("number", false, "The number isn't active on the WhatsApp Cloud API yet", "Click \"Activate number\" and enter your two-step verification PIN.");
    else check("number", false, out.number.problems[0] || "The number can't send messages yet");
    if (out.number.quality && out.number.quality !== "GREEN" && out.number.quality !== "UNKNOWN") {
      check("quality", false, `Message quality is ${out.number.quality.toLowerCase()}`, "Customers are blocking or reporting messages. Send fewer marketing messages and only to people who opted in.");
    }
  } catch (err) {
    check("number", false, `Couldn't read the number from Meta: ${err.message}`);
  }
  if (conn.wabaId) {
    try {
      out.subscribed = await subscribed(token, conn.wabaId);
      check("webhooks", out.subscribed, out.subscribed ? "Receiving messages and delivery updates" : "Oyklane isn't receiving this account's messages yet", "Click \"Activate number\" (it also turns on message delivery).");
    } catch (err) {
      check("webhooks", false, `Couldn't check message delivery: ${err.message}`);
    }
  }
  if (!out.webhookConfigured) check("platform", false, "Incoming messages aren't set up on Oyklane yet", "Ask the Oyklane team to finish the WhatsApp webhook setup.");
  return out;
}

/** Registers the number on the Cloud API with the seller's 6-digit
 * two-step verification PIN (setting it if there wasn't one), then
 * subscribes Oyklane to the account's webhooks. Both are safe to repeat. */
async function activate(prisma, store, { pin }) {
  const conn = await connectionOrThrow(prisma, store.id);
  if (!/^\d{6}$/.test(String(pin || ""))) throw new HttpError(400, "Enter the 6-digit PIN.");
  const token = waToken(conn);
  await meta.graphRequest(`/${conn.phoneNumberId}/register`, { method: "POST", token, body: { messaging_product: "whatsapp", pin: String(pin) } }).catch((err) => {
    if (/two-step|pin/i.test(err.message)) throw new HttpError(400, "Meta didn't accept that PIN. Use the two-step verification PIN set for this number (WhatsApp Manager ▸ Phone numbers ▸ Settings ▸ Two-step verification), or reset it there.", err.details);
    throw err;
  });
  const data = { waActivatedAt: new Date() };
  if (conn.wabaId) {
    await meta.graphRequest(`/${conn.wabaId}/subscribed_apps`, { method: "POST", token });
    data.waSubscribedAt = new Date();
  }
  await repository.update(prisma, store.id, data);
  return health(prisma, store);
}

/** What the admin needs to open Meta's Embedded Signup popup. */
function signupConfig() {
  if (!env.META_APP_ID || !env.META_WA_SIGNUP_CONFIG_ID) return { available: false };
  return { available: true, appId: env.META_APP_ID, configId: env.META_WA_SIGNUP_CONFIG_ID, graphVersion: env.META_GRAPH_API_VERSION };
}

/**
 * Embedded Signup finished: the popup handed the admin a `code` and (by
 * window message) the WhatsApp account and number ids. The code becomes
 * a business token for that account; Oyklane subscribes to its webhooks
 * and saves the number. A brand-new number still needs registering with
 * a PIN — `needsPin` tells the admin to ask for one.
 */
async function completeSignup(prisma, store, { code, wabaId, phoneNumberId, businessId }) {
  if (!env.META_APP_ID || !env.META_APP_SECRET) throw new HttpError(400, "WhatsApp sign-up isn't set up on Oyklane yet.");
  if (!code || !wabaId) throw new HttpError(400, "Meta didn't finish the sign-up. Try again.");
  // JS SDK codes are exchanged without a redirect_uri.
  const tok = await meta.graphRequest("/oauth/access_token", { params: { client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, code } });
  const token = tok.access_token;
  if (!token) throw new HttpError(502, "Meta didn't return access for the WhatsApp account. Try again.");
  const waba = await meta.graphRequest(`/${wabaId}`, { token, params: { fields: "id,name" } }).catch(() => ({ id: wabaId, name: null }));
  let number = null;
  if (phoneNumberId) {
    number = meta.shapeNumber(await meta.graphRequest(`/${phoneNumberId}`, { token, params: { fields: meta.WABA_NUMBER_FIELDS } }));
  } else {
    const list = await meta.graphRequest(`/${wabaId}/phone_numbers`, { token, params: { fields: meta.WABA_NUMBER_FIELDS } });
    number = list.data?.[0] ? meta.shapeNumber(list.data[0]) : null;
  }
  await meta.graphRequest(`/${wabaId}/subscribed_apps`, { method: "POST", token });
  const existing = await repository.findByStore(prisma, store.id);
  const fields = {
    waAccessToken: token,
    waBusinessId: businessId || null,
    wabaId,
    wabaName: waba.name || "WhatsApp Business account",
    phoneNumberId: number?.id || null,
    phoneNumberLabel: number?.label || null,
    waSubscribedAt: new Date(),
    waActivatedAt: number?.ready ? new Date() : null,
  };
  if (existing) await repository.update(prisma, store.id, fields);
  else await repository.upsert(prisma, store.id, { accessToken: token, tokenExpiresAt: null, facebookUserName: waba.name || "WhatsApp", ...fields });
  return { number, needsPin: Boolean(number && !number.ready && number.action === "activate") };
}

/** Sends any Cloud API message payload from the store's number. */
async function send(conn, payload) {
  const result = await meta.graphRequest(`/${conn.phoneNumberId}/messages`, {
    method: "POST",
    token: waToken(conn),
    body: { messaging_product: "whatsapp", recipient_type: "individual", ...payload },
  });
  const id = result.messages?.[0]?.id;
  if (!id) throw new HttpError(502, "Meta didn't confirm the message.");
  return { id, waId: result.contacts?.[0]?.wa_id || null };
}

// ── Templates ────────────────────────────────────────────────────────────

const TEMPLATE_FIELDS = "id,name,language,status,category,components,rejected_reason,quality_score,previous_category";

async function listTemplates(conn, { status } = {}) {
  if (!conn.wabaId) return [];
  const out = [];
  let after = null;
  for (let page = 0; page < 10; page += 1) {
    const r = await meta.graphRequest(`/${conn.wabaId}/message_templates`, { token: waToken(conn), params: { fields: TEMPLATE_FIELDS, limit: 100, after, status } });
    out.push(...(r.data || []));
    after = r.paging?.cursors?.after;
    if (!r.paging?.next || !after) break;
  }
  return out;
}

async function createTemplate(conn, spec) {
  if (!conn.wabaId) throw new HttpError(400, "Choose your WhatsApp account first.");
  return meta.graphRequest(`/${conn.wabaId}/message_templates`, { method: "POST", token: waToken(conn), body: spec });
}

/** Meta allows editing a template's components (and category, once
 * approved) — the edit goes back into review. */
async function editTemplate(conn, templateId, spec) {
  return meta.graphRequest(`/${templateId}`, { method: "POST", token: waToken(conn), body: spec });
}

async function deleteTemplate(conn, { name, id }) {
  if (!conn.wabaId) throw new HttpError(400, "Choose your WhatsApp account first.");
  return meta.graphRequest(`/${conn.wabaId}/message_templates`, { method: "DELETE", token: waToken(conn), params: { name, hsm_id: id } });
}

/** A sample header file for a template under review: Meta's resumable
 * upload gives a handle that goes in the template's example. */
async function uploadTemplateSample(conn, { buffer, mime, name }) {
  const session = await meta.graphRequest(`/${env.META_APP_ID}/uploads`, {
    method: "POST",
    token: waToken(conn),
    params: { file_name: name || "sample", file_length: buffer.length, file_type: mime },
  });
  const res = await fetch(`${meta.graphBase()}/${session.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${waToken(conn)}`, file_offset: "0" },
    body: buffer,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.h) throw meta.metaError(res, data);
  return data.h;
}

/** Media a customer sent: Meta gives a short-lived link that needs the token. */
async function downloadMedia(conn, mediaId) {
  const info = await meta.graphRequest(`/${mediaId}`, { token: waToken(conn) });
  const res = await fetch(info.url, { headers: { Authorization: `Bearer ${waToken(conn)}` } });
  if (!res.ok) throw new HttpError(502, "Meta didn't return the file.");
  return { buffer: Buffer.from(await res.arrayBuffer()), mime: info.mime_type || res.headers.get("content-type") || "application/octet-stream" };
}

/** Uploads a file to send in a message (images, documents). */
async function uploadMedia(conn, { buffer, mime, name }) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", new Blob([buffer], { type: mime }), name || "file");
  const r = await meta.graphRequest(`/${conn.phoneNumberId}/media`, { method: "POST", token: waToken(conn), form });
  return r.id;
}

module.exports = {
  waToken,
  connectionOrThrow,
  health,
  activate,
  signupConfig,
  completeSignup,
  send,
  listTemplates,
  createTemplate,
  editTemplate,
  deleteTemplate,
  uploadTemplateSample,
  downloadMedia,
  uploadMedia,
};
