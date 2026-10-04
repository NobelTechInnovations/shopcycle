/**
 * Stored links to outside services (Instagram, Google reviews) — one row
 * per store and app in app_connections. Storefront pages read the cached
 * posts/reviews from here and never wait for Instagram or Google: a stale
 * cache is refreshed in the background after the page is served.
 */

const STALE_MS = {
  "instagram-feed": 3 * 60 * 60 * 1000, // post image links from Instagram expire after a few days
  "google-reviews": 24 * 60 * 60 * 1000,
};

const refreshing = new Set();

function get(prisma, storeId, appKey) {
  return prisma.appConnection.findUnique({ where: { storeId_appKey: { storeId, appKey } } });
}

function save(prisma, storeId, appKey, data) {
  return prisma.appConnection.upsert({
    where: { storeId_appKey: { storeId, appKey } },
    create: { storeId, appKey, ...data },
    update: data,
  });
}

function remove(prisma, storeId, appKey) {
  return prisma.appConnection.deleteMany({ where: { storeId, appKey } });
}

/** Runs `refresh` once at a time per store and app, without waiting. */
function refreshLater(key, refresh, log) {
  if (refreshing.has(key)) return;
  refreshing.add(key);
  Promise.resolve()
    .then(refresh)
    .catch((err) => log?.warn?.({ err }, "social: background refresh failed"))
    .finally(() => refreshing.delete(key));
}

/**
 * What a store's theme gets for the installed social apps:
 * `instagram` { username, profile_url, posts: [...] } and
 * `google_reviews` { name, rating, total, url, reviews: [...] } — or null.
 * Stale caches are refreshed in the background.
 */
async function storefrontData(prisma, storeId, installed, { log } = {}) {
  const keys = ["instagram-feed", "google-reviews"].filter((k) => installed[k]);
  if (!keys.length) return {};
  const rows = await prisma.appConnection.findMany({ where: { storeId, appKey: { in: keys } } });
  const out = {};
  for (const row of rows) {
    const age = row.fetchedAt ? Date.now() - new Date(row.fetchedAt).getTime() : Infinity;
    if (age > STALE_MS[row.appKey]) {
      const service = row.appKey === "instagram-feed" ? require("./instagram") : require("./google-reviews");
      refreshLater(`${row.appKey}:${storeId}`, () => service.refresh(prisma, storeId), log);
    }
    if (row.appKey === "instagram-feed") out.instagram = require("./instagram").forTheme(row, installed[row.appKey]);
    if (row.appKey === "google-reviews") out.google_reviews = require("./google-reviews").forTheme(row, installed[row.appKey]);
  }
  return out;
}

/** HTML-escapes text that came from Instagram or Google before a theme prints it. */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only https links from the service itself go into a page. */
const safeUrl = (url) => (/^https:\/\/[^\s"'<>]+$/i.test(String(url || "")) ? String(url) : null);

module.exports = { get, save, remove, storefrontData, refreshLater, esc, safeUrl, STALE_MS };
