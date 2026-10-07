const { HttpError } = require("@shopcycle/utils");
const google = require("../../lib/google-api");
const connections = require("../social/connections");
const googleAccount = require("../accounts/google");
const { storefrontUrl } = require("../../lib/storefront-url");
const feed = require("./feed");

/**
 * Google & YouTube sales channel: the store's products on Google (free
 * listings on Shopping, Search, Images, YouTube and Maps, and Shopping
 * ads) through the seller's Google Merchant Center account.
 *
 * Connecting (the store's Google account — accounts/google.js — then pick
 * the Merchant Center account) adds a data source to the seller's Merchant
 * Center that fetches the store's product feed every day, and asks Google
 * to fetch it again whenever the seller presses Sync — so listings keep
 * updating on Google's side even if nothing here runs.
 * Without the Google sign-in set up, the seller pastes the feed URL into
 * Merchant Center themselves (Products ▸ Add products ▸ From a file ▸
 * scheduled fetch).
 */

const APP_KEY = "google-shopping";
const HOST = "merchantapi.googleapis.com";
const DATA_SOURCE_NAME = "Oyklane store";

/** One Merchant API call with the store's Google account. */
async function api(prisma, storeId, method, path, body) {
  const token = await googleAccount.accessToken(prisma, storeId, "merchant");
  return google.call(token, method, google.url(HOST, path), body);
}

/** Merchant Center accounts the store's Google account can use. */
async function accounts(prisma, storeId) {
  const json = await api(prisma, storeId, "GET", "/accounts/v1/accounts?pageSize=50");
  return (json.accounts || []).map((a) => ({ id: String(a.accountId || String(a.name).split("/").pop()), name: String(a.accountName || a.name) }));
}

/** Finds or adds the data source that fetches this store's feed daily. */
async function ensureDataSource(prisma, store, accountId) {
  const list = await api(prisma, store.id, "GET", `/datasources/v1/accounts/${accountId}/dataSources?pageSize=100`);
  const url = feed.feedUrls(store).google;
  const existing = (list.dataSources || []).find((d) => d.fileInput?.fetchSettings?.fetchUri === url || d.displayName === DATA_SOURCE_NAME);
  if (existing) return existing;
  return api(prisma, store.id, "POST", `/datasources/v1/accounts/${accountId}/dataSources`, {
    displayName: DATA_SOURCE_NAME,
    primaryProductDataSource: { contentLanguage: "en", feedLabel: "IN", countries: ["IN"] },
    fileInput: {
      fetchSettings: { enabled: true, fetchUri: url, frequency: "FREQUENCY_DAILY", timeOfDay: { hours: 4 }, timeZone: "Asia/Kolkata" },
    },
  });
}

const notFound = (err) => err?.googleStatus === 404 || /not found/i.test(String(err?.message || ""));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Asks Google to fetch the feed now. Best effort. A data source made a
 * moment ago can be "not found" for a few seconds, so that's tried again;
 * `missing` means it's really gone (deleted in Merchant Center). */
async function fetchNow(prisma, storeId, dataSourceName) {
  for (let attempt = 0; ; attempt++) {
    try {
      await api(prisma, storeId, "POST", `/datasources/v1/${dataSourceName}:fetch`, {});
      return { ok: true };
    } catch (err) {
      if (notFound(err) && attempt < 2) {
        await wait(4000);
        continue;
      }
      return { ok: false, missing: notFound(err), error: err.message };
    }
  }
}

/** Whether the data source is still in Merchant Center (null: unknown). */
async function dataSourceExists(prisma, storeId, dataSourceName) {
  try {
    await api(prisma, storeId, "GET", `/datasources/v1/${dataSourceName}`);
    return true;
  } catch (err) {
    return notFound(err) ? false : null;
  }
}

/** Lists the store's products through this Merchant Center account. */
async function useAccount(prisma, store, accountId) {
  const account = (await accounts(prisma, store.id)).find((a) => a.id === String(accountId));
  if (!account) throw new HttpError(400, "That Merchant Center account isn't on your Google account — pick another.");
  const dataSource = await ensureDataSource(prisma, store, account.id);
  const fetched = await fetchNow(prisma, store.id, dataSource.name);
  return connections.save(prisma, store.id, APP_KEY, {
    // Which account and data source; the sign-in stays with the store's Google account.
    credentials: { accountId: account.id, dataSource: dataSource.name },
    profile: { accountId: account.id, accountName: account.name, dataSource: dataSource.name, connectedAt: new Date().toISOString() },
    items: [],
    fetchedAt: new Date(),
    // Not fetched straight away is fine — Google reads the feed on its
    // daily schedule anyway.
    error: fetched.ok || fetched.missing ? null : fetched.error,
  });
}

/** "Sync now": Google fetches the feed again. If the feed's data source
 * was deleted in Merchant Center, it's added back first. */
async function sync(prisma, store) {
  const row = await connections.get(prisma, store.id, APP_KEY);
  if (!row?.credentials?.dataSource) throw new HttpError(400, "Connect your Merchant Center first.");
  let dataSource = row.credentials.dataSource;
  let r = await fetchNow(prisma, store.id, dataSource);
  if (r.missing && (await dataSourceExists(prisma, store.id, dataSource)) === false) {
    dataSource = (await ensureDataSource(prisma, store, row.credentials.accountId)).name;
    r = await fetchNow(prisma, store.id, dataSource);
  }
  return connections.save(prisma, store.id, APP_KEY, {
    credentials: { ...row.credentials, dataSource },
    profile: { ...row.profile, dataSource },
    fetchedAt: new Date(),
    error: r.ok || r.missing ? null : r.error,
  });
}

/** Google's report on its last fetch of the feed (null: not read yet). */
async function lastFetch(prisma, store, row) {
  if (!row?.credentials?.dataSource) return null;
  try {
    const json = await api(prisma, store.id, "GET", `/datasources/v1/${row.credentials.dataSource}/fileUploads/latest`);
    return {
      state: json.processingState || null,
      at: json.uploadTime || null,
      total: Number(json.itemsTotal || 0),
      created: Number(json.itemsCreated || 0),
      updated: Number(json.itemsUpdated || 0),
      issues: (json.issues || []).slice(0, 20).map((i) => ({ title: i.title || i.code, description: i.description || "", count: Number(i.count || 0), severity: i.severity || "" })),
    };
  } catch (err) {
    // "File upload not found": Google hasn't fetched the feed yet.
    if (notFound(err)) return null;
    return { error: err.message };
  }
}

/** Tells Google which website is the store's (and claims it, once the
 * verification tag is on the store). */
async function claimWebsite(prisma, store) {
  const row = await connections.get(prisma, store.id, APP_KEY);
  if (!row?.credentials?.accountId) throw new HttpError(400, "Connect your Merchant Center first.");
  const uri = storefrontUrl(store, "/");
  const accountId = row.credentials.accountId;
  await api(prisma, store.id, "PATCH", `/accounts/v1/accounts/${accountId}/homepage?updateMask=uri`, { uri });
  try {
    await api(prisma, store.id, "POST", `/accounts/v1/accounts/${accountId}/homepage:claim`, {});
    await connections.save(prisma, store.id, APP_KEY, { profile: { ...row.profile, website: uri, claimed: true } });
    return { website: uri, claimed: true };
  } catch (err) {
    await connections.save(prisma, store.id, APP_KEY, { profile: { ...row.profile, website: uri, claimed: false } });
    return { website: uri, claimed: false, error: err.message };
  }
}

async function forAdmin(prisma, store, { withStatus = false } = {}) {
  let row = await connections.get(prisma, store.id, APP_KEY);
  // An old "data source not found" from the first fetch: clear it once
  // the data source answers (or say plainly that it's gone).
  if (withStatus && row?.credentials?.dataSource && /was not found/i.test(row.error || "")) {
    const exists = await dataSourceExists(prisma, store.id, row.credentials.dataSource);
    if (exists === true) row = await connections.save(prisma, store.id, APP_KEY, { error: null });
    else if (exists === false) row = await connections.save(prisma, store.id, APP_KEY, { error: "Your Oyklane feed isn't in Merchant Center anymore — press Sync now to add it back." });
  }
  const products = await feed.summary(prisma, store, "google");
  return {
    signIn: google.configured(),
    account: await googleAccount.get(prisma, store.id),
    connected: Boolean(row?.credentials?.dataSource),
    merchant: row?.profile?.accountId ? { id: row.profile.accountId, name: row.profile.accountName, website: row.profile.website || null, claimed: Boolean(row.profile.claimed) } : null,
    syncedAt: row?.fetchedAt || null,
    error: row?.error || null,
    lastFetch: withStatus ? await lastFetch(prisma, store, row) : null,
    products,
    website: storefrontUrl(store, "/"),
  };
}

module.exports = { APP_KEY, accounts, useAccount, sync, claimWebsite, forAdmin, lastFetch };
