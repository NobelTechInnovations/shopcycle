const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");

function metaConfigured() {
  return Boolean(env.META_APP_ID && env.META_APP_SECRET);
}

const GRAPH_BASE = () => `${env.META_GRAPH_API_URL.replace(/\/$/, "")}/${env.META_GRAPH_API_VERSION}`;

/** Meta's error, in words a seller can act on. Code 190 is an expired or
 * revoked login (the seller changed their password, removed the app or the
 * token aged out) — the admin offers "Reconnect" for it. */
function metaError(res, data) {
  const e = data?.error || {};
  const expired = e.code === 190 || e.type === "OAuthException" && /expired|session has been invalidated|validating access token/i.test(e.message || "");
  const permission = e.code === 10 || e.code === 200 || (e.code >= 200 && e.code < 300);
  const message =
    e.error_user_msg ||
    (expired
      ? "Your Facebook connection has expired. Reconnect Facebook to continue."
      : permission
        ? `Meta didn't allow this: ${e.message || "missing permission"}. The permission may still be waiting for Meta's App Review, or wasn't ticked when connecting.`
        : e.message || `Meta API request failed: ${res.status}`);
  return new HttpError(expired ? 424 : 502, message, {
    meta: { code: e.code ?? null, subcode: e.error_subcode ?? null, title: e.error_user_title || null, type: e.type || null, trace: e.fbtrace_id || null },
    reason: expired ? "meta_expired" : permission ? "meta_permission" : "meta_error",
  });
}

async function graphRequest(path, { method = "GET", token, params, body, form } = {}) {
  const url = /^https?:/.test(path) ? new URL(path) : new URL(`${GRAPH_BASE()}${path}`);
  if (token) url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : v);
  }

  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    // `form`: a FormData (file uploads: ad images and videos, media).
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw metaError(res, data);
  return data;
}

/** Where the merchant is sent to grant access. Requesting every scope
 * both apps could ever need up front (rather than incrementally per-app)
 * — Meta's own consent screen already breaks permissions out per line
 * item, and asking twice would mean connecting Facebook twice.
 *
 * The redirect target is a page in the admin app itself (not the API) —
 * that page reads the `code` Meta appends and immediately POSTs it, as an
 * authenticated same-site request, to the API's own /connect/exchange
 * (see meta/controller.js). Which store the code belongs to therefore
 * comes from that request's session cookie, the same way every other
 * write in this app is scoped — not from an OAuth `state` param, which
 * would just be re-deriving something the session already tells us. */
function buildAuthorizeUrl(scopes) {
  const url = new URL("https://www.facebook.com/dialog/oauth");
  url.searchParams.set("client_id", env.META_APP_ID);
  url.searchParams.set("redirect_uri", env.META_OAUTH_REDIRECT_URI);
  url.searchParams.set(
    "scope",
    (
      scopes || [
        "ads_management",
        "ads_read",
        "business_management",
        "pages_show_list",
        "pages_read_engagement",
        "whatsapp_business_management",
        "whatsapp_business_messaging",
      ]
    ).join(",")
  );
  return url.toString();
}

/** Pixels (datasets) the connected Facebook user can use — across their
 * ad accounts, newest activity first. */
async function listPixels(token) {
  const accounts = await graphRequest("/me/adaccounts", { token, params: { fields: "id,name", limit: 25 } });
  const seen = new Map();
  for (const acct of (accounts.data || []).slice(0, 15)) {
    try {
      const px = await graphRequest(`/${acct.id}/adspixels`, { token, params: { fields: "id,name,last_fired_time", limit: 50 } });
      for (const p of px.data || []) {
        if (!seen.has(p.id)) seen.set(p.id, { id: p.id, name: p.name, adAccount: acct.name, lastFired: p.last_fired_time || null });
      }
    } catch {
      // An ad account without pixel access — skip it.
    }
  }
  return [...seen.values()].sort((a, b) => String(b.lastFired || "").localeCompare(String(a.lastFired || "")));
}

/** Authorization code → short-lived token → long-lived (~60 day) token,
 * in one step — nothing here is worth persisting until it's the long-lived
 * one, so the short-lived intermediate token never touches the database. */
async function exchangeCodeForLongLivedToken(code) {
  const short = await graphRequest("/oauth/access_token", {
    params: {
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      redirect_uri: env.META_OAUTH_REDIRECT_URI,
      code,
    },
  });
  // A Facebook Login for Business configuration can hand out a business
  // system-user token, which already lasts and can't be exchanged — keep
  // the token from the code as it is then.
  const long = await graphRequest("/oauth/access_token", {
    params: {
      grant_type: "fb_exchange_token",
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      fb_exchange_token: short.access_token,
    },
  }).catch(() => null);
  const token = long?.access_token ? long : short;
  return {
    accessToken: token.access_token,
    expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
  };
}

async function fetchProfile(token) {
  return graphRequest("/me", { token, params: { fields: "id,name" } });
}

/** Plain-language state of one WhatsApp number: can Oyklane send from it,
 * and if not, what the seller has to do. */
function numberState(n) {
  const problems = [];
  let action = null;
  if (n.code_verification_status && n.code_verification_status !== "VERIFIED") {
    problems.push("The number isn't verified yet. In WhatsApp Manager ▸ Phone numbers, verify it with the code Meta sends by SMS or call.");
  }
  if (n.platform_type === "ON_PREMISE") problems.push("This number uses Meta's old On-Premises API. Migrate it to the Cloud API in WhatsApp Manager.");
  // Only a real rejection is a problem — test numbers and numbers without a
  // reviewed name report NONE / NON_EXISTS and still send.
  if (n.name_status === "DECLINED") problems.push("Meta declined the display name. Change it in WhatsApp Manager ▸ Phone numbers ▸ Profile.");
  if (n.name_status === "PENDING_REVIEW") problems.push("Meta is still reviewing this number's display name (usually 1–2 days). It can send once Meta approves it — nothing to do until then.");
  if (n.status === "FLAGGED" || n.status === "RESTRICTED") problems.push("Meta has limited this number because of low message quality. Check WhatsApp Manager ▸ Insights.");
  if (n.status === "BANNED") problems.push("Meta has banned this number. Contact Meta support from WhatsApp Manager.");
  if (n.status === "MIGRATED") problems.push("This number moved to another WhatsApp Business account.");
  const connected = n.status === "CONNECTED" && n.platform_type === "CLOUD_API";
  const test = /^\+?1\s?555/.test(String(n.display_phone_number || "").replace(/[()-]/g, " ").replace(/\s+/g, " "));
  if (!connected && !problems.length) {
    // Verified but not registered on the Cloud API (added in WhatsApp
    // Manager, or registered with a different provider) — Oyklane can
    // register it with the seller's two-step PIN.
    action = "activate";
  }
  return {
    ready: connected && !problems.length,
    action,
    problems,
    // Meta's +1 555 test numbers only message the recipients you list in the app dashboard.
    test,
  };
}

const WABA_NUMBER_FIELDS =
  "id,verified_name,display_phone_number,status,code_verification_status,platform_type,name_status,quality_rating,messaging_limit_tier";

function shapeNumber(n) {
  const st = numberState(n);
  return {
    id: n.id,
    label: `${n.verified_name || "WhatsApp"} (${n.display_phone_number})`,
    displayPhoneNumber: n.display_phone_number,
    verifiedName: n.verified_name || null,
    status: n.status || null,
    codeVerification: n.code_verification_status || null,
    platform: n.platform_type || null,
    nameStatus: n.name_status || null,
    quality: n.quality_rating || null,
    limitTier: n.messaging_limit_tier || null,
    ...st,
  };
}

/** WhatsApp ids the token was granted (Facebook Login for Business: the
 * accounts the seller ticked). null when the token has no granular scopes. */
async function grantedWhatsappIds(token) {
  try {
    const dbg = await graphRequest("/debug_token", { token: `${env.META_APP_ID}|${env.META_APP_SECRET}`, params: { input_token: token } });
    const gs = dbg.data?.granular_scopes;
    if (!Array.isArray(gs)) return { ids: null, scopes: dbg.data?.scopes || [] };
    const ids = new Set(gs.filter((g) => g.scope === "whatsapp_business_management").flatMap((g) => g.target_ids || []));
    return { ids, scopes: dbg.data?.scopes || [], all: !gs.some((g) => g.scope === "whatsapp_business_management" && Array.isArray(g.target_ids)) };
  } catch {
    return { ids: null, scopes: [] };
  }
}

/**
 * The seller's WhatsApp Business accounts and their numbers. A WABA
 * belongs to a business, not a Page, so it's found three ways (de-duped):
 * the exact accounts the seller ticked in Facebook Login for Business
 * (the token's granular scopes), the WABAs their businesses own or manage
 * for clients, and — for older setups — a Page's linked WABA.
 *
 * Every account found is returned, with why it can't be used when that's
 * the case (no number yet, not ticked when connecting, Meta refused) —
 * the seller sees the reason instead of an empty list.
 */
async function listWabas(token, pages) {
  const found = new Map();
  const grant = await grantedWhatsappIds(token);
  const hasWaScope = grant.scopes.includes("whatsapp_business_management");
  const add = async (waba, owner = {}) => {
    if (!waba?.id || found.has(waba.id)) return;
    const entry = {
      id: waba.id,
      pageId: owner.pageId || null,
      pageName: waba.name || owner.name || "WhatsApp Business account",
      name: waba.name || owner.name || "WhatsApp Business account",
      businessName: owner.businessName || null,
      granted: grant.ids ? grant.all || grant.ids.has(waba.id) : hasWaScope ? true : false,
      phoneNumbers: [],
      problem: null,
      manageUrl: `https://business.facebook.com/wa/manage/phone-numbers/?waba_id=${encodeURIComponent(waba.id)}`,
    };
    found.set(waba.id, entry);
    try {
      const numbers = await graphRequest(`/${waba.id}/phone_numbers`, { token, params: { fields: WABA_NUMBER_FIELDS, limit: 50 } });
      entry.phoneNumbers = (numbers.data || []).map(shapeNumber);
    } catch (err) {
      entry.problem = err.message;
    }
    if (!entry.problem && !entry.phoneNumbers.length) {
      entry.problem = !hasWaScope
        ? "Oyklane wasn't given WhatsApp access when you connected. Reconnect Facebook and allow WhatsApp."
        : !entry.granted
          ? "This WhatsApp account wasn't ticked when you connected Facebook, so Meta hides its numbers. Reconnect and tick it under WhatsApp accounts."
          : "This WhatsApp Business account has no phone number yet. Add one with \"Add a WhatsApp number\" below, or in WhatsApp Manager ▸ Phone numbers.";
    }
  };

  // 1. What the seller ticked in the login dialog.
  if (grant.ids) {
    for (const id of grant.ids) {
      const waba = await graphRequest(`/${id}`, { token, params: { fields: "id,name" } }).catch(() => ({ id }));
      await add(waba);
    }
  }

  // 2. Their businesses' own and client WABAs.
  try {
    const businesses = await graphRequest("/me/businesses", { token, params: { fields: "id,name", limit: 50 } });
    for (const b of businesses.data || []) {
      for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
        const list = await graphRequest(`/${b.id}/${edge}`, { token, params: { fields: "id,name", limit: 50 } }).catch(() => ({ data: [] }));
        for (const waba of list.data || []) await add(waba, { businessName: b.name });
      }
    }
  } catch {
    // business_management not granted — fine.
  }

  // 3. A Page's linked WABA (older setups).
  for (const page of pages) {
    const owned = await graphRequest(`/${page.id}/whatsapp_business_accounts`, { token }).catch(() => ({ data: [] }));
    for (const waba of owned.data || []) await add(waba, { pageId: page.id, name: page.name });
  }

  // Usable accounts first.
  return [...found.values()].sort((a, b) => Number(b.phoneNumbers.some((n) => n.ready)) - Number(a.phoneNumbers.some((n) => n.ready)));
}

async function listConnectableAssets(token) {
  const [adAccounts, pages] = await Promise.all([
    graphRequest("/me/adaccounts", { token, params: { fields: "id,name,account_status", limit: 50 } }),
    graphRequest("/me/accounts", { token, params: { fields: "id,name,instagram_business_account{id,username,profile_picture_url},connected_instagram_account{id,username}", limit: 50 } }),
  ]);

  const wabas = await listWabas(token, pages.data || []);

  // Instagram accounts ads can run from: the one linked to each Page, and
  // any connected straight to an ad account in Business Manager.
  const instagram = new Map();
  for (const p of pages.data || []) {
    const ig = p.instagram_business_account || p.connected_instagram_account;
    if (ig?.id && !instagram.has(ig.id)) instagram.set(ig.id, { id: ig.id, username: ig.username || null, picture: ig.profile_picture_url || null, pageId: p.id, adAccountIds: [] });
  }
  await Promise.all(
    (adAccounts.data || []).slice(0, 10).map(async (a) => {
      const r = await graphRequest(`/${a.id}/instagram_accounts`, { token, params: { fields: "id,username,profile_pic", limit: 25 } }).catch(() => ({ data: [] }));
      for (const ig of r.data || []) {
        const cur = instagram.get(ig.id) || { id: ig.id, username: ig.username || null, picture: ig.profile_pic || null, pageId: null, adAccountIds: [] };
        cur.adAccountIds.push(a.id);
        instagram.set(ig.id, cur);
      }
    })
  );

  return {
    adAccounts: (adAccounts.data || []).map((a) => ({ id: a.id, name: a.name })),
    pages: (pages.data || []).map((p) => {
      const ig = p.instagram_business_account || p.connected_instagram_account;
      return { id: p.id, name: p.name, instagramId: ig?.id || null };
    }),
    instagramAccounts: [...instagram.values()],
    wabas,
  };
}

module.exports = {
  listWabas,
  graphBase: GRAPH_BASE,
  metaError,
  numberState,
  shapeNumber,
  WABA_NUMBER_FIELDS,
  listPixels,
  metaConfigured,
  graphRequest,
  buildAuthorizeUrl,
  exchangeCodeForLongLivedToken,
  fetchProfile,
  listConnectableAssets,
};
