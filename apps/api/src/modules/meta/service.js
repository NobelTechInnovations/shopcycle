const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");

function metaConfigured() {
  return Boolean(env.META_APP_ID && env.META_APP_SECRET);
}

const GRAPH_BASE = () => `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`;

async function graphRequest(path, { method = "GET", token, params, body } = {}) {
  const url = new URL(`${GRAPH_BASE()}${path}`);
  if (token) url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : v);
  }

  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new HttpError(502, data?.error?.message || `Meta API request failed: ${res.status}`);
  }
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
function buildAuthorizeUrl() {
  const url = new URL("https://www.facebook.com/dialog/oauth");
  url.searchParams.set("client_id", env.META_APP_ID);
  url.searchParams.set("redirect_uri", env.META_OAUTH_REDIRECT_URI);
  url.searchParams.set(
    "scope",
    [
      "ads_management",
      "ads_read",
      "business_management",
      "pages_show_list",
      "pages_read_engagement",
      "whatsapp_business_management",
      "whatsapp_business_messaging",
    ].join(",")
  );
  return url.toString();
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
  const long = await graphRequest("/oauth/access_token", {
    params: {
      grant_type: "fb_exchange_token",
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      fb_exchange_token: short.access_token,
    },
  });
  return {
    accessToken: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
  };
}

async function fetchProfile(token) {
  return graphRequest("/me", { token, params: { fields: "id,name" } });
}

/** Everything the Connect screen needs to let the merchant pick which ad
 * account / page / WhatsApp number to actually use — a single connection
 * can see several of each (e.g. an agency-run Business Manager), so this
 * is a picker, not an auto-selection. WhatsApp phone numbers are nested
 * under each WABA, which is itself nested under the page's business — kept
 * as a flat, pre-joined list here so the admin UI doesn't have to walk the
 * Graph API's own nesting itself. */
async function listConnectableAssets(token) {
  const [adAccounts, pages] = await Promise.all([
    graphRequest("/me/adaccounts", { token, params: { fields: "id,name,account_status" } }),
    graphRequest("/me/accounts", { token, params: { fields: "id,name" } }),
  ]);

  const wabas = [];
  for (const page of pages.data || []) {
    // A page's WhatsApp Business Account, if any is attached — most pages
    // have none, so a per-page 400/empty response here is expected, not
    // an error worth surfacing.
    try {
      const owned = await graphRequest(`/${page.id}/whatsapp_business_accounts`, { token });
      for (const waba of owned.data || []) {
        const numbers = await graphRequest(`/${waba.id}/phone_numbers`, {
          token,
          params: { fields: "id,verified_name,display_phone_number" },
        });
        wabas.push({
          id: waba.id,
          pageId: page.id,
          pageName: page.name,
          phoneNumbers: (numbers.data || []).map((n) => ({
            id: n.id,
            label: `${n.verified_name} (${n.display_phone_number})`,
          })),
        });
      }
    } catch {
      // No WhatsApp asset on this page — nothing to add.
    }
  }

  return {
    adAccounts: (adAccounts.data || []).map((a) => ({ id: a.id, name: a.name })),
    pages: (pages.data || []).map((p) => ({ id: p.id, name: p.name })),
    wabas,
  };
}

module.exports = {
  metaConfigured,
  graphRequest,
  buildAuthorizeUrl,
  exchangeCodeForLongLivedToken,
  fetchProfile,
  listConnectableAssets,
};
