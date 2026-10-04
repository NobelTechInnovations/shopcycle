const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const google = require("../../lib/google-api");
const connections = require("./connections");
const accounts = require("../accounts/google");

/**
 * Google reviews app: the store's Google rating and reviews in a section
 * of their theme, refreshed daily. Two ways to connect:
 * - Sign in with Google (the account that manages the Business Profile):
 *   every review, through the Business Profile API. The connection lasts
 *   until the seller removes it in their Google account.
 * - Find the business on Google Maps by name: Places API (New), which
 *   shares the rating, the review count and five reviews.
 * Shown with Google's attribution and each reviewer's name, as Google
 * requires.
 */

const APP_KEY = "google-reviews";
const ready = () => Boolean(env.GOOGLE_PLACES_API_KEY);
const businessReady = () => google.configured();
const base = () => env.GOOGLE_PLACES_URL.replace(/\/$/, "");

async function call(path, { method = "GET", body, fields }) {
  if (!ready()) throw new HttpError(400, "Google reviews isn't set up on Oyklane yet.");
  let res;
  try {
    res = await fetch(`${base()}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-goog-api-key": env.GOOGLE_PLACES_API_KEY, "x-goog-fieldmask": fields },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(502, "Couldn't reach Google. Try again in a minute.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `Google answered ${res.status}`;
    throw new HttpError(res.status === 404 ? 404 : 400, res.status === 404 ? "Google couldn't find that business any more. Search for it again." : msg);
  }
  return json;
}

/** Businesses on Google Maps matching the seller's words. */
async function search(query) {
  const text = String(query || "").trim().slice(0, 120);
  if (text.length < 3) throw new HttpError(400, "Type your business name (and city).");
  const json = await call("/places:searchText", {
    method: "POST",
    body: { textQuery: text, languageCode: "en", regionCode: "IN", pageSize: 8 },
    fields: "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
  });
  return (json.places || []).map((p) => ({
    id: p.id,
    name: p.displayName?.text || "",
    address: p.formattedAddress || "",
    rating: p.rating ?? null,
    total: p.userRatingCount ?? 0,
  }));
}

function mapReview(r) {
  return {
    author: String(r.authorAttribution?.displayName || "A Google user").slice(0, 80),
    authorUrl: connections.safeUrl(r.authorAttribution?.uri),
    photo: connections.safeUrl(r.authorAttribution?.photoUri),
    rating: Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0))),
    text: String(r.text?.text || r.originalText?.text || "").slice(0, 1500),
    when: String(r.relativePublishTimeDescription || ""),
    at: r.publishTime || null,
    url: connections.safeUrl(r.googleMapsUri),
  };
}

async function fetchPlace(placeId) {
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(String(placeId || ""))) throw new HttpError(400, "Pick your business from the list.");
  const p = await call(`/places/${encodeURIComponent(placeId)}?languageCode=en`, {
    fields: "id,displayName,formattedAddress,rating,userRatingCount,reviews,googleMapsUri",
  });
  return {
    profile: {
      placeId: p.id,
      name: p.displayName?.text || "",
      address: p.formattedAddress || "",
      rating: p.rating ?? null,
      total: p.userRatingCount ?? 0,
      url: connections.safeUrl(p.googleMapsUri),
    },
    items: (p.reviews || []).map(mapReview),
  };
}

async function connect(prisma, storeId, placeId) {
  const { profile, items } = await fetchPlace(placeId);
  return connections.save(prisma, storeId, APP_KEY, { credentials: { via: "places", placeId: profile.placeId }, profile, items, fetchedAt: new Date(), error: null });
}

// ── Sign in with Google (Business Profile) ───────────────────────

const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** "3 weeks ago". */
function ago(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (!Number.isFinite(days) || days < 1) return "today";
  const unit = (n, w) => `${n} ${w}${n === 1 ? "" : "s"} ago`;
  if (days < 7) return unit(days, "day");
  if (days < 30) return unit(Math.floor(days / 7), "week");
  if (days < 365) return unit(Math.floor(days / 30), "month");
  return unit(Math.floor(days / 365), "year");
}

/** Google adds a translation above the original — keep the reviewer's own words. */
function ownWords(comment) {
  const text = String(comment || "");
  const original = text.split(/\(Original\)\s*/)[1];
  return (original || text.replace(/^\(Translated by Google\)\s*/, "")).trim();
}

function mapBusinessReview(r) {
  return {
    author: r.reviewer?.isAnonymous ? "A Google user" : String(r.reviewer?.displayName || "A Google user").slice(0, 80),
    authorUrl: null,
    photo: connections.safeUrl(r.reviewer?.profilePhotoUrl),
    rating: STARS[r.starRating] || 0,
    text: ownWords(r.comment).slice(0, 1500),
    when: ago(r.updateTime || r.createTime),
    at: r.createTime || null,
    url: null,
  };
}

/** Every business location the signed-in Google account manages. */
async function listLocations(token) {
  const accounts = await google.call(token, "GET", google.url("mybusinessaccountmanagement.googleapis.com", "/v1/accounts?pageSize=20"));
  const out = [];
  for (const a of (accounts.accounts || []).slice(0, 10)) {
    const q = new URLSearchParams({ readMask: "name,title,storefrontAddress,metadata", pageSize: "100" });
    const locs = await google.call(token, "GET", google.url("mybusinessbusinessinformation.googleapis.com", `/v1/${a.name}/locations?${q}`));
    for (const l of locs.locations || []) {
      out.push({
        account: String(a.name),
        location: String(l.name),
        name: String(l.title || ""),
        address: [...(l.storefrontAddress?.addressLines || []), l.storefrontAddress?.locality].filter(Boolean).join(", "),
        placeId: l.metadata?.placeId || null,
        mapsUri: l.metadata?.mapsUri || null,
        reviewUri: l.metadata?.newReviewUri || null,
      });
    }
  }
  return out;
}

/** The location's rating and reviews (up to 150, newest first). */
async function fetchBusiness(token, loc) {
  const items = [];
  let meta = { rating: null, total: 0 };
  let pageToken = null;
  for (let page = 0; page < 3; page++) {
    const q = new URLSearchParams({ pageSize: "50", orderBy: "updateTime desc", ...(pageToken && { pageToken }) });
    const json = await google.call(token, "GET", google.url("mybusiness.googleapis.com", `/v4/${loc.account}/${loc.location}/reviews?${q}`));
    if (page === 0) meta = { rating: json.averageRating ?? null, total: json.totalReviewCount ?? 0 };
    items.push(...(json.reviews || []).map(mapBusinessReview));
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return {
    profile: {
      placeId: loc.placeId,
      name: loc.name,
      address: loc.address,
      rating: meta.rating,
      total: meta.total,
      url: connections.safeUrl(loc.mapsUri),
      reviewUrl: connections.safeUrl(loc.reviewUri),
      source: "business",
    },
    items,
  };
}

/** The businesses the store's Google account manages — what "Choose your
 * business" lists. No tokens leave the server. */
async function locations(prisma, storeId) {
  const token = await accounts.accessToken(prisma, storeId, "reviews");
  try {
    return await listLocations(token);
  } catch (err) {
    if (err.googleStatus === 403 || err.googleStatus === 429) {
      throw new HttpError(400, "Google hasn't opened its Business Profile connection to Oyklane yet. Find your business by name below for now.");
    }
    throw err;
  }
}

/** Shows this business's reviews (one the store's Google account manages). */
async function useLocation(prisma, storeId, location) {
  const loc = (await locations(prisma, storeId)).find((l) => l.location === String(location));
  if (!loc) throw new HttpError(400, "That business isn't on your Google account any more — pick another.");
  const token = await accounts.accessToken(prisma, storeId, "reviews");
  const { profile, items } = await fetchBusiness(token, loc);
  return connections.save(prisma, storeId, APP_KEY, {
    // Which business; the sign-in itself stays with the store's Google account.
    credentials: { via: "google", account: loc.account, location: loc.location, placeId: loc.placeId, mapsUri: loc.mapsUri, reviewUri: loc.reviewUri, name: loc.name, address: loc.address },
    profile,
    items,
    fetchedAt: new Date(),
    error: null,
  });
}

async function refresh(prisma, storeId) {
  const row = await connections.get(prisma, storeId, APP_KEY);
  if (row?.credentials?.via === "google" && row.credentials.location) {
    try {
      const c = row.credentials;
      const token = await accounts.accessToken(prisma, storeId, "reviews");
      const { profile, items } = await fetchBusiness(token, { account: c.account, location: c.location, placeId: c.placeId, mapsUri: c.mapsUri, reviewUri: c.reviewUri, name: c.name, address: c.address });
      return connections.save(prisma, storeId, APP_KEY, { profile, items, fetchedAt: new Date(), error: null });
    } catch (err) {
      return connections.save(prisma, storeId, APP_KEY, { fetchedAt: new Date(), error: err.message || "Couldn't refresh the reviews" });
    }
  }
  const placeId = row?.credentials?.placeId;
  if (!placeId || !ready()) return row;
  try {
    const { profile, items } = await fetchPlace(placeId);
    return connections.save(prisma, storeId, APP_KEY, { profile, items, fetchedAt: new Date(), error: null });
  } catch (err) {
    return connections.save(prisma, storeId, APP_KEY, { fetchedAt: new Date(), error: err.message || "Couldn't refresh the reviews" });
  }
}

/** For the theme: reviews at or above the app's minimum stars, escaped. */
function forTheme(row, settings = {}) {
  if (!row?.profile?.name) return null;
  const min = Math.max(1, Math.min(5, Number(settings.minRating) || 4));
  const reviews = (Array.isArray(row.items) ? row.items : [])
    .filter((r) => r.rating >= min && String(r.text || "").trim())
    .map((r) => ({
      author: connections.esc(r.author),
      initial: connections.esc(String(r.author || "?").trim().charAt(0).toUpperCase()),
      photo: r.photo,
      author_url: r.authorUrl,
      rating: r.rating,
      text: connections.esc(r.text),
      when: connections.esc(r.when),
      url: r.url,
    }))
    .slice(0, 24);
  return {
    name: connections.esc(row.profile.name),
    rating: row.profile.rating,
    rating_text: row.profile.rating != null ? Number(row.profile.rating).toFixed(1) : null,
    total: row.profile.total || 0,
    url: row.profile.url,
    write_url: row.profile.reviewUrl || (row.profile.placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(row.profile.placeId)}` : row.profile.url),
    reviews,
  };
}

/** For the admin's page — never a token. */
function forAdmin(row) {
  const base = { ready: ready(), business: businessReady() };
  if (!row?.profile?.name) return { connected: false, ...base };
  return { connected: true, ...base, via: row.credentials?.via === "google" ? "google" : "places", location: row.credentials?.location || null, profile: row.profile, reviews: row.items || [], fetchedAt: row.fetchedAt, error: row.error };
}

module.exports = { APP_KEY, ready, businessReady, search, connect, locations, useLocation, refresh, forTheme, forAdmin };
