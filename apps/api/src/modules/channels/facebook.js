const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const meta = require("../meta/service");
const connections = require("../social/connections");
const facebookAccount = require("../accounts/facebook");
const feed = require("./feed");

/**
 * Facebook & Instagram sales channel: the store's products in a Meta
 * catalog — for a shop on the Facebook Page and Instagram profile, product
 * tags in posts and reels, and catalog (Advantage+) ads.
 *
 * Connecting (the store's Facebook login — accounts/facebook.js — then pick
 * a catalog) picks or creates a catalog in the seller's Business Manager
 * and adds a data feed to it that Meta fetches every hour from the store's
 * feed URL. The feed keeps updating on Meta's side for good — even after
 * the Facebook login itself expires (60 days), which only matters for
 * "Sync now" and the status shown here. Without the Facebook login set up,
 * the seller adds the feed URL in Commerce Manager (Catalogue ▸ Data
 * sources ▸ Data feed ▸ Scheduled feed).
 */

const APP_KEY = "facebook-shop";
const FEED_NAME = "Oyklane store";

const graph = (path) => `${env.META_GRAPH_API_URL.replace(/\/$/, "")}/${env.META_GRAPH_API_VERSION}${path}`;

async function call(token, method, path, params = {}) {
  const url = new URL(graph(path));
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, access_token: token })) {
    if (v == null) continue;
    (method === "GET" ? url.searchParams : body).set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  let res;
  try {
    res = await fetch(url, { method, ...(method !== "GET" && { body, headers: { "content-type": "application/x-www-form-urlencoded" } }), signal: AbortSignal.timeout(20000) });
  } catch {
    throw new HttpError(502, "Couldn't reach Facebook. Try again in a minute.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    if (e.code === 190) throw new HttpError(400, "Facebook says the connection has expired. Connect again — your catalog keeps updating meanwhile.");
    if (e.code === 10 || e.code === 200) throw new HttpError(400, "Facebook didn't allow that. Connect again and allow access to your business and catalogs.");
    throw new HttpError(400, e.error_user_msg || e.message || `Facebook answered ${res.status}`);
  }
  return json;
}

/** The store's Facebook login, for catalog calls. */
const userToken = (prisma, storeId) => facebookAccount.token(prisma, storeId, "catalog");

/** The seller's businesses and their catalogs, to pick from. */
async function catalogs(prisma, store) {
  const token = await userToken(prisma, store.id);
  let businesses;
  try {
    businesses = await call(token, "GET", "/me/businesses", { fields: "id,name", limit: 25 });
  } catch (err) {
    throw facebookAccount.explain(err, "catalog");
  }
  const list = [];
  for (const b of (businesses.data || []).slice(0, 15)) {
    let items = [];
    try {
      const c = await call(token, "GET", `/${b.id}/owned_product_catalogs`, { fields: "id,name,product_count", limit: 50 });
      items = (c.data || []).map((x) => ({ id: String(x.id), name: String(x.name || ""), products: Number(x.product_count || 0) }));
    } catch {
      // A business this login can't read catalogs in — still offer "create".
    }
    list.push({ id: String(b.id), name: String(b.name || ""), catalogs: items });
  }
  if (!list.length) {
    throw new HttpError(400, "Your Facebook account has no Business Manager. Create one free at business.facebook.com, then come back.");
  }
  return list;
}

/** Uses (or creates) a catalog and gives it the hourly feed from this store. */
async function useCatalog(prisma, store, { businessId, catalogId, create }) {
  const token = await userToken(prisma, store.id);
  const business = (await catalogs(prisma, store)).find((b) => b.id === String(businessId));
  if (!business) throw new HttpError(400, "That business isn't on your Facebook account — pick another.");
  let catalog = create ? null : business.catalogs.find((c) => c.id === String(catalogId));
  if (!create && !catalog) throw new HttpError(400, "Pick one of the catalogs.");
  if (create) {
    const made = await call(token, "POST", `/${business.id}/owned_product_catalogs`, { name: `${store.name} · Oyklane`.slice(0, 100), vertical: "commerce" });
    catalog = { id: String(made.id), name: `${store.name} · Oyklane`, products: 0 };
  }
  const url = feed.feedUrls(store).facebook;
  const feeds = await call(token, "GET", `/${catalog.id}/product_feeds`, { fields: "id,name,schedule", limit: 50 });
  let feedRow = (feeds.data || []).find((f) => f.name === FEED_NAME || f.schedule?.url === url);
  if (!feedRow) {
    const made = await call(token, "POST", `/${catalog.id}/product_feeds`, { name: FEED_NAME, schedule: { interval: "HOURLY", url } });
    feedRow = { id: String(made.id) };
  }
  let error = null;
  try {
    await call(token, "POST", `/${feedRow.id}/uploads`, { url });
  } catch (err) {
    error = err.message;
  }
  return connections.save(prisma, store.id, APP_KEY, {
    // Which catalog and feed; the login stays with the store's Facebook account.
    credentials: { businessId: business.id, catalogId: catalog.id, feedId: String(feedRow.id) },
    profile: { businessId: business.id, businessName: business.name, catalogId: catalog.id, catalogName: catalog.name, feedId: String(feedRow.id), connectedAt: new Date().toISOString() },
    items: [],
    fetchedAt: new Date(),
    error,
  });
}

/** "Sync now": Meta fetches the feed again. */
async function sync(prisma, store) {
  const row = await connections.get(prisma, store.id, APP_KEY);
  if (!row?.credentials?.feedId) throw new HttpError(400, "Connect a catalog first.");
  try {
    await call(await userToken(prisma, store.id), "POST", `/${row.credentials.feedId}/uploads`, { url: feed.feedUrls(store).facebook });
    return connections.save(prisma, store.id, APP_KEY, { fetchedAt: new Date(), error: null });
  } catch (err) {
    await connections.save(prisma, store.id, APP_KEY, { error: err.message });
    throw err;
  }
}

/** Meta's report on its latest fetch of the feed. */
async function lastFetch(prisma, store, row) {
  if (!row?.credentials?.feedId) return null;
  try {
    const json = await call(await userToken(prisma, store.id), "GET", `/${row.credentials.feedId}/uploads`, {
      fields: "id,start_time,end_time,num_detected_items,num_persisted_items,num_invalid_items,error_count,warning_count",
      limit: 1,
    });
    const u = (json.data || [])[0];
    if (!u) return { state: "waiting" };
    return {
      state: u.end_time ? "done" : "running",
      at: u.end_time || u.start_time || null,
      total: Number(u.num_detected_items || 0),
      saved: Number(u.num_persisted_items || 0),
      invalid: Number(u.num_invalid_items || 0),
      errors: Number(u.error_count || 0),
      warnings: Number(u.warning_count || 0),
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function forAdmin(prisma, store, { withStatus = false } = {}) {
  const row = await connections.get(prisma, store.id, APP_KEY);
  const c = row?.credentials || {};
  return {
    signIn: meta.metaConfigured(),
    account: await facebookAccount.status(prisma, store.id),
    connected: Boolean(c.feedId),
    catalog: c.feedId ? { businessName: row.profile.businessName, catalogId: row.profile.catalogId, catalogName: row.profile.catalogName } : null,
    syncedAt: row?.fetchedAt || null,
    error: row?.error || null,
    lastFetch: withStatus ? await lastFetch(prisma, store, row) : null,
    products: await feed.summary(prisma, store, "facebook"),
  };
}

module.exports = { APP_KEY, catalogs, useCatalog, sync, forAdmin, lastFetch };
