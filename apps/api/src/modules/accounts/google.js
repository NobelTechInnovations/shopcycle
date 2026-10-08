const { HttpError } = require("@shopcycle/utils");
const google = require("../../lib/google-api");
const connections = require("../social/connections");

/**
 * The store's Google account — one sign-in (Oyklane's own Google app, the
 * seller never sees a key or token) that every Google app uses: Google
 * Reviews reads the Business Profile, Google & YouTube lists products in
 * Merchant Center. All of it is asked for on the first sign-in, so
 * installing another Google app later is just "pick your business" — never
 * "connect Google" again. Kept in app_connections under "google-account".
 */

const KEY = "google-account";
// What each Google app needs, by the name the apps use.
const ACCESS = { reviews: google.SCOPES.reviews, merchant: google.SCOPES.merchant, analytics: google.SCOPES.analytics, tagmanager: google.SCOPES.tagmanager };
const LABEL = { reviews: "your Business Profile", merchant: "Merchant Center", analytics: "Google Analytics", tagmanager: "Tag Manager" };

function status(row) {
  const granted = row?.credentials?.scopes || [];
  return {
    configured: google.configured(),
    connected: Boolean(row?.credentials?.refreshToken),
    email: row?.profile?.email || null,
    name: row?.profile?.name || null,
    picture: row?.profile?.picture || null,
    connectedAt: row?.profile?.connectedAt || null,
    access: Object.fromEntries(Object.entries(ACCESS).map(([k, scope]) => [k, granted.includes(scope)])),
    error: row?.error || null,
  };
}

async function get(prisma, storeId) {
  return status(await connections.get(prisma, storeId, KEY));
}

/** Google's sign-in for this store, asking for every Google app's access. */
function authorizeUrl(state) {
  if (!google.configured()) throw new HttpError(400, "Google sign-in isn't set up on Oyklane yet.");
  return google.authorizeUrl(Object.values(ACCESS), state);
}

/** The code Google sent back → the store's Google account. */
async function connect(prisma, storeId, code) {
  const { credentials, scopes, profile } = await google.exchangeCode(code);
  const row = await connections.save(prisma, storeId, KEY, {
    credentials: { ...credentials, scopes },
    profile: { ...profile, connectedAt: new Date().toISOString() },
    items: [],
    fetchedAt: new Date(),
    error: null,
  });
  return status(row);
}

/** Thrown when an app needs the Google account (or more of it): the admin
 * shows "Sign in with Google" for `details.needs`. */
function needsGoogle(access, message) {
  return new HttpError(409, message, { needs: "google", access });
}

/** A working access token with `access` ("reviews" | "merchant"). */
async function accessToken(prisma, storeId, access) {
  const row = await connections.get(prisma, storeId, KEY);
  if (!row?.credentials?.refreshToken) throw needsGoogle(access, "Sign in with Google first.");
  if (access && !(row.credentials.scopes || []).includes(ACCESS[access])) {
    throw needsGoogle(access, `Your Google sign-in didn't include ${LABEL[access]}. Sign in with Google again and tick every box.`);
  }
  try {
    const { token, fresh } = await google.accessToken(row.credentials);
    if (fresh) await connections.save(prisma, storeId, KEY, { credentials: fresh, error: null });
    return token;
  } catch (err) {
    if (/removed or expired|expired/i.test(err.message || "")) {
      await connections.save(prisma, storeId, KEY, { error: "Google says this connection was removed. Sign in with Google again." });
      throw needsGoogle(access, "Google says this connection was removed. Sign in with Google again.");
    }
    throw err;
  }
}

async function disconnect(prisma, storeId) {
  const row = await connections.get(prisma, storeId, KEY);
  if (row?.credentials?.refreshToken) await google.revoke(row.credentials);
  await connections.remove(prisma, storeId, KEY);
}

module.exports = { KEY, ACCESS, get, status, authorizeUrl, connect, accessToken, needsGoogle, disconnect };
