const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const connections = require("./connections");

/**
 * Instagram feed app: the store's latest Instagram posts in a scrolling
 * section of their theme. Uses the "Instagram API with Instagram Login"
 * (Business or Creator accounts): the seller connects with one click when
 * Oyklane's Instagram app is set up (INSTAGRAM_APP_ID/SECRET), or pastes an
 * access token. Tokens last 60 days and are renewed as the feed refreshes.
 */

const APP_KEY = "instagram-feed";
const GRAPH_VERSION = "v22.0";
const MEDIA_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";
const PROFILE_FIELDS = "user_id,username,name,profile_picture_url,followers_count,media_count";
const DAY = 24 * 60 * 60 * 1000;

const oauthReady = () => Boolean(env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET);
const redirectUri = () => `${env.ADMIN_ORIGIN.replace(/\/$/, "")}/admin/apps/instagram`;
const graph = (path, params) => `${env.INSTAGRAM_GRAPH_URL.replace(/\/$/, "")}${path}?${new URLSearchParams(params)}`;

function authorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: env.INSTAGRAM_APP_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "instagram_business_basic",
    state,
  });
  return `${env.INSTAGRAM_OAUTH_URL}?${params}`;
}

/** Instagram's error, in words a seller can act on. */
function explain(json, status) {
  const e = json?.error || {};
  const msg = e.error_user_msg || e.message || json?.error_message || json?.error_description || `Instagram answered ${status}`;
  if (e.code === 190 || /token/i.test(msg)) return "Instagram says the connection has expired or was removed. Connect again.";
  if (/professional|business|creator/i.test(msg)) return "Instagram feeds work with Business or Creator accounts. Switch your account type in the Instagram app (Settings ▸ Account type), then connect again.";
  return msg;
}

async function call(url, init) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new HttpError(502, "Couldn't reach Instagram. Try again in a minute.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new HttpError(400, explain(json, res.status));
  return json;
}

function mapPost(m) {
  const image = connections.safeUrl(m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url);
  if (!image) return null;
  return {
    id: String(m.id),
    type: m.media_type,
    image,
    url: connections.safeUrl(m.permalink),
    caption: String(m.caption || "").slice(0, 500),
    at: m.timestamp || null,
    likes: Number.isFinite(m.like_count) ? m.like_count : null,
    comments: Number.isFinite(m.comments_count) ? m.comments_count : null,
  };
}

async function fetchAll(token) {
  const [profile, media] = await Promise.all([
    call(graph(`/${GRAPH_VERSION}/me`, { fields: PROFILE_FIELDS, access_token: token })),
    call(graph(`/${GRAPH_VERSION}/me/media`, { fields: MEDIA_FIELDS, limit: "24", access_token: token })),
  ]);
  return {
    profile: {
      id: String(profile.user_id || profile.id || ""),
      username: String(profile.username || ""),
      name: String(profile.name || ""),
      picture: connections.safeUrl(profile.profile_picture_url),
      followers: Number.isFinite(profile.followers_count) ? profile.followers_count : null,
      posts: Number.isFinite(profile.media_count) ? profile.media_count : null,
    },
    items: (media.data || []).map(mapPost).filter(Boolean),
  };
}

/** A 60-day token from a fresh one (and its expiry), or null if Instagram won't. */
async function renew(token) {
  try {
    const json = await call(graph("/refresh_access_token", { grant_type: "ig_refresh_token", access_token: token }));
    return { token: json.access_token, expiresAt: new Date(Date.now() + (Number(json.expires_in) || 60 * 24 * 3600) * 1000) };
  } catch {
    return null;
  }
}

async function store(prisma, storeId, token, expiresAt) {
  const { profile, items } = await fetchAll(token);
  if (!profile.username) throw new HttpError(400, "Instagram didn't return an account for that token.");
  return connections.save(prisma, storeId, APP_KEY, {
    credentials: { accessToken: token, connectedAt: new Date().toISOString() },
    profile,
    items,
    fetchedAt: new Date(),
    expiresAt,
    error: null,
  });
}

/** One-click connect: the code Instagram sent back to the admin. */
async function connectWithCode(prisma, storeId, code) {
  if (!oauthReady()) throw new HttpError(400, "Instagram sign-in isn't set up on Oyklane yet — paste an access token instead.");
  const body = new URLSearchParams({
    client_id: env.INSTAGRAM_APP_ID,
    client_secret: env.INSTAGRAM_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
    code: String(code).replace(/#_$/, ""),
  });
  const short = await call(`${env.INSTAGRAM_API_URL.replace(/\/$/, "")}/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const shortToken = short.access_token || short.data?.[0]?.access_token;
  if (!shortToken) throw new HttpError(400, "Instagram didn't send an access token. Try connecting again.");
  const long = await call(graph("/access_token", { grant_type: "ig_exchange_token", client_secret: env.INSTAGRAM_APP_SECRET, access_token: shortToken }));
  return store(prisma, storeId, long.access_token, new Date(Date.now() + (Number(long.expires_in) || 60 * 24 * 3600) * 1000));
}

/** Pasted token (from Meta's developer dashboard): checked, then kept. */
async function connectWithToken(prisma, storeId, token) {
  const clean = String(token || "").trim();
  if (!/^[A-Za-z0-9_|.-]{20,600}$/.test(clean)) throw new HttpError(400, "That doesn't look like an Instagram access token.");
  const renewed = await renew(clean);
  return store(prisma, storeId, renewed?.token || clean, renewed?.expiresAt || null);
}

/** Fresh posts (and a renewed token when it's within 20 days of expiring). */
async function refresh(prisma, storeId) {
  const row = await connections.get(prisma, storeId, APP_KEY);
  const token = row?.credentials?.accessToken;
  if (!token) return row;
  let current = token;
  let expiresAt = row.expiresAt;
  if (!expiresAt || new Date(expiresAt).getTime() - Date.now() < 20 * DAY) {
    const renewed = await renew(token);
    if (renewed) {
      current = renewed.token;
      expiresAt = renewed.expiresAt;
    }
  }
  try {
    const { profile, items } = await fetchAll(current);
    return connections.save(prisma, storeId, APP_KEY, { credentials: { ...row.credentials, accessToken: current }, profile, items, fetchedAt: new Date(), expiresAt, error: null });
  } catch (err) {
    // Keep showing the last posts; tell the seller what went wrong.
    return connections.save(prisma, storeId, APP_KEY, { fetchedAt: new Date(), error: err.message || "Couldn't refresh the feed" });
  }
}

/** For the theme: captions escaped, links checked. */
function forTheme(row) {
  if (!row?.profile?.username) return null;
  const username = connections.esc(row.profile.username);
  const posts = (Array.isArray(row.items) ? row.items : []).map((p) => ({
    image: p.image,
    url: p.url || `https://www.instagram.com/${encodeURIComponent(row.profile.username)}/`,
    caption: connections.esc(p.caption),
    alt: connections.esc(String(p.caption || "").split("\n")[0].slice(0, 120)) || `Post by @${username}`,
    video: p.type === "VIDEO",
    likes: p.likes,
  }));
  return {
    username,
    name: connections.esc(row.profile.name || row.profile.username),
    picture: row.profile.picture || null,
    followers: row.profile.followers,
    profile_url: `https://www.instagram.com/${encodeURIComponent(row.profile.username)}/`,
    posts,
  };
}

/** For the admin's Instagram page — never the token. */
function forAdmin(row) {
  if (!row?.profile?.username) return { connected: false, oauth: oauthReady() };
  return {
    connected: true,
    oauth: oauthReady(),
    profile: row.profile,
    posts: (row.items || []).slice(0, 12),
    fetchedAt: row.fetchedAt,
    expiresAt: row.expiresAt,
    error: row.error,
  };
}

module.exports = { APP_KEY, oauthReady, authorizeUrl, connectWithCode, connectWithToken, refresh, forTheme, forAdmin };
