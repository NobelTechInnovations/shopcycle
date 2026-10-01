const { HttpError } = require("@shopcycle/utils");
const { env } = require("../../config/env");
const connections = require("./connections");

/**
 * Google reviews app: the store's Google rating and reviews in a section
 * of their theme. The seller finds their business (Google Maps listing)
 * by name; Google's Places API (New) gives its rating, review count and up
 * to five recent reviews, refreshed daily. Shown with Google's attribution
 * and each reviewer's name, as Google requires.
 */

const APP_KEY = "google-reviews";
const ready = () => Boolean(env.GOOGLE_PLACES_API_KEY);
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
  return connections.save(prisma, storeId, APP_KEY, { credentials: { placeId: profile.placeId }, profile, items, fetchedAt: new Date(), error: null });
}

async function refresh(prisma, storeId) {
  const row = await connections.get(prisma, storeId, APP_KEY);
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
    }));
  return {
    name: connections.esc(row.profile.name),
    rating: row.profile.rating,
    rating_text: row.profile.rating != null ? Number(row.profile.rating).toFixed(1) : null,
    total: row.profile.total || 0,
    url: row.profile.url,
    write_url: row.profile.placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(row.profile.placeId)}` : row.profile.url,
    reviews,
  };
}

function forAdmin(row) {
  if (!row?.profile?.name) return { connected: false, ready: ready() };
  return { connected: true, ready: ready(), profile: row.profile, reviews: row.items || [], fetchedAt: row.fetchedAt, error: row.error };
}

module.exports = { APP_KEY, ready, search, connect, refresh, forTheme, forAdmin };
