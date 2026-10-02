const { HttpError } = require("@shopcycle/utils");
const google = require("../../lib/google-api");
const connections = require("../social/connections");
const { storefrontUrl } = require("../../lib/storefront-url");
const feed = require("./feed");

/**
 * Google & YouTube sales channel: the store's products on Google (free
 * listings on Shopping, Search, Images, YouTube and Maps, and Shopping
 * ads) through the seller's Google Merchant Center account.
 *
 * Connecting (Sign in with Google, Merchant API) adds a data source to the
 * seller's Merchant Center that fetches the store's product feed every
 * day, and asks Google to fetch it again whenever the seller presses Sync
 * — so listings keep updating on Google's side even if nothing here runs.
 * Without the Google sign-in set up, the seller pastes the feed URL into
 * Merchant Center themselves (Products ▸ Add products ▸ From a file ▸
 * scheduled fetch).
 */

const APP_KEY = "google-shopping";
const HOST = "merchantapi.googleapis.com";
const DATA_SOURCE_NAME = "Oyklane store";

async function api(credentials, method, path, body) {
  const { token, fresh } = await google.accessToken(credentials);
  const json = await google.call(token, method, google.url(HOST, path), body);
  return { json, fresh };
}

/** Merchant Center accounts the signed-in Google account can use. */
async function listAccounts(token) {
  const json = await google.call(token, "GET", google.url(HOST, "/accounts/v1/accounts?pageSize=50"));
  return (json.accounts || []).map((a) => ({ id: String(a.accountId || String(a.name).split("/").pop()), name: String(a.accountName || a.name) }));
}

/** Finds or adds the data source that fetches this store's feed daily. */
async function ensureDataSource(credentials, accountId, store) {
  const list = await api(credentials, "GET", `/datasources/v1/accounts/${accountId}/dataSources?pageSize=100`);
  let creds = list.fresh || credentials;
  const url = feed.feedUrls(store).google;
  const existing = (list.json.dataSources || []).find((d) => d.fileInput?.fetchSettings?.fetchUri === url || d.displayName === DATA_SOURCE_NAME);
  if (existing) return { dataSource: existing, credentials: creds };
  const created = await api(creds, "POST", `/datasources/v1/accounts/${accountId}/dataSources`, {
    displayName: DATA_SOURCE_NAME,
    primaryProductDataSource: { contentLanguage: "en", feedLabel: "IN", countries: ["IN"] },
    fileInput: {
      fileName: "oyklane-products.xml",
      fetchSettings: { enabled: true, fetchUri: url, frequency: "FREQUENCY_DAILY", timeOfDay: { hours: 4 }, timeZone: "Asia/Kolkata" },
    },
  });
  creds = created.fresh || creds;
  return { dataSource: created.json, credentials: creds };
}

/** Asks Google to fetch the feed now. Best effort. */
async function fetchNow(credentials, dataSourceName) {
  try {
    const r = await api(credentials, "POST", `/datasources/v1/${dataSourceName}:fetch`, {});
    return { ok: true, credentials: r.fresh || credentials };
  } catch (err) {
    return { ok: false, error: err.message, credentials };
  }
}

async function useAccount(prisma, store, credentials, account) {
  const { dataSource, credentials: creds } = await ensureDataSource(credentials, account.id, store);
  const fetched = await fetchNow(creds, dataSource.name);
  const { pendingAccounts, ...clean } = fetched.credentials;
  return connections.save(prisma, store.id, APP_KEY, {
    credentials: { ...clean, accountId: account.id, dataSource: dataSource.name },
    profile: { accountId: account.id, accountName: account.name, dataSource: dataSource.name, connectedAt: new Date().toISOString() },
    items: [],
    fetchedAt: new Date(),
    error: fetched.ok ? null : fetched.error,
  });
}

/** The code from Google's sign-in: one Merchant Center account → set up;
 * several → the seller picks. */
async function connectWithGoogle(prisma, store, code) {
  const credentials = await google.exchangeCode(code, "merchant");
  const { token } = await google.accessToken(credentials);
  const accounts = await listAccounts(token);
  if (!accounts.length) {
    throw new HttpError(400, "That Google account has no Merchant Center account. Create one free at merchants.google.com (choose India), then connect again.");
  }
  if (accounts.length === 1) return useAccount(prisma, store, credentials, accounts[0]);
  const row = await connections.get(prisma, store.id, APP_KEY);
  return connections.save(prisma, store.id, APP_KEY, {
    credentials: { ...(row?.credentials || {}), pending: { ...credentials, accounts } },
    ...(row ? {} : { profile: {}, items: [] }),
  });
}

async function chooseAccount(prisma, store, accountId) {
  const row = await connections.get(prisma, store.id, APP_KEY);
  const pending = row?.credentials?.pending;
  const account = pending?.accounts?.find((a) => a.id === String(accountId));
  if (!account) throw new HttpError(400, "That choice expired — sign in with Google again.");
  const { accounts, ...credentials } = pending;
  return useAccount(prisma, store, credentials, account);
}

/** "Sync now": Google fetches the feed again. */
async function sync(prisma, store) {
  const row = await connections.get(prisma, store.id, APP_KEY);
  if (!row?.credentials?.dataSource) throw new HttpError(400, "Connect your Merchant Center first.");
  const r = await fetchNow(row.credentials, row.credentials.dataSource);
  return connections.save(prisma, store.id, APP_KEY, { credentials: r.credentials, fetchedAt: new Date(), error: r.ok ? null : r.error });
}

/** Google's report on its last fetch of the feed. */
async function lastFetch(row) {
  if (!row?.credentials?.dataSource) return null;
  try {
    const { json } = await api(row.credentials, "GET", `/datasources/v1/${row.credentials.dataSource}/fileUploads/latest`);
    return {
      state: json.processingState || null,
      at: json.uploadTime || null,
      total: Number(json.itemsTotal || 0),
      created: Number(json.itemsCreated || 0),
      updated: Number(json.itemsUpdated || 0),
      issues: (json.issues || []).slice(0, 20).map((i) => ({ title: i.title || i.code, description: i.description || "", count: Number(i.count || 0), severity: i.severity || "" })),
    };
  } catch (err) {
    return { error: err.message };
  }
}

/** Tells Google which website is the store's (and claims it, once the
 * verification tag is on the store). */
async function claimWebsite(prisma, store) {
  const row = await connections.get(prisma, store.id, APP_KEY);
  if (!row?.credentials?.accountId) throw new HttpError(400, "Connect your Merchant Center first.");
  const uri = storefrontUrl(store, "/");
  let creds = row.credentials;
  const set = await api(creds, "PATCH", `/accounts/v1/accounts/${creds.accountId}/homepage?updateMask=uri`, { uri });
  creds = set.fresh || creds;
  try {
    const claim = await api(creds, "POST", `/accounts/v1/accounts/${creds.accountId}/homepage:claim`, {});
    creds = claim.fresh || creds;
    await connections.save(prisma, store.id, APP_KEY, { credentials: creds, profile: { ...row.profile, website: uri, claimed: true } });
    return { website: uri, claimed: true };
  } catch (err) {
    await connections.save(prisma, store.id, APP_KEY, { credentials: creds, profile: { ...row.profile, website: uri, claimed: false } });
    return { website: uri, claimed: false, error: err.message };
  }
}

async function forAdmin(prisma, store, { withStatus = false } = {}) {
  const row = await connections.get(prisma, store.id, APP_KEY);
  const products = await feed.summary(prisma, store, "google");
  const pending = row?.credentials?.pending;
  return {
    signIn: google.configured(),
    connected: Boolean(row?.credentials?.dataSource),
    account: row?.profile?.accountId ? { id: row.profile.accountId, name: row.profile.accountName, website: row.profile.website || null, claimed: Boolean(row.profile.claimed) } : null,
    choose: pending ? pending.accounts : null,
    syncedAt: row?.fetchedAt || null,
    error: row?.error || null,
    lastFetch: withStatus ? await lastFetch(row) : null,
    products,
    website: storefrontUrl(store, "/"),
  };
}

module.exports = { APP_KEY, connectWithGoogle, chooseAccount, sync, claimWebsite, forAdmin, lastFetch };
