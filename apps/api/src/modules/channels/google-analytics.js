const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const google = require("../../lib/google-api");
const googleAccount = require("../accounts/google");
const { env } = require("../../config/env");
const { storefrontUrl } = require("../../lib/storefront-url");
const { GA_ID, GTM_ID, ADS_ID, ADS_LABEL } = require("../storefront/tracking");

/**
 * Apps ▸ Google Analytics & Tag Manager, through the store's one Google
 * sign-in (accounts/google.js):
 *   Analytics    pick a GA4 property's web stream, or make a property and
 *                stream for the store — the Measurement ID fills itself
 *                in; no account yet → Google's own sign-up (terms), then
 *                back here
 *   Tag Manager  pick a web container or make one for the store
 *   Google Ads   link the Ads account to the GA4 property (by its
 *                customer ID — listing Ads accounts needs a Google Ads
 *                developer token), and the purchase conversion tag
 * Everything lands in the google-analytics app's settings, which the
 * storefront reads (storefront/tracking.js).
 */

const APP_KEY = "google-analytics";
const ADMIN = "analyticsadmin.googleapis.com";
const GTM = "tagmanager.googleapis.com";

const call = async (prisma, storeId, access, method, host, path, body) => google.call(await googleAccount.accessToken(prisma, storeId, access), method, google.url(host, path), body);

async function installRow(prisma, storeId) {
  return prisma.storeApp.findFirst({ where: { storeId, app: { key: APP_KEY } } });
}

async function saveSettings(prisma, storeId, patch) {
  const row = await installRow(prisma, storeId);
  if (!row) throw new HttpError(404, "Install Google Analytics first.");
  const settings = { ...(row.settings || {}), ...patch };
  await prisma.storeApp.update({ where: { id: row.id }, data: { settings } });
  return settings;
}

async function forAdmin(prisma, store) {
  const row = await installRow(prisma, store.id);
  if (!row) throw new HttpError(404, "Install Google Analytics first.");
  const s = row.settings || {};
  return {
    signIn: google.configured(),
    account: await googleAccount.get(prisma, store.id),
    settings: {
      measurementId: s.measurementId || "",
      propertyName: s.propertyName || null,
      gtmId: s.gtmId || "",
      gtmName: s.gtmName || null,
      adsCustomerId: s.adsCustomerId || "",
      adsConversionId: s.adsConversionId || "",
      adsConversionLabel: s.adsConversionLabel || "",
    },
    website: storefrontUrl(store, "/"),
  };
}

// ── Analytics ────────────────────────────────────────────────────────

/** GA accounts and their GA4 properties on the seller's Google account. */
async function analyticsAccounts(prisma, storeId) {
  const json = await call(prisma, storeId, "analytics", "GET", ADMIN, "/v1beta/accountSummaries?pageSize=200");
  return (json.accountSummaries || []).map((a) => ({
    account: a.account,
    name: a.displayName,
    properties: (a.propertySummaries || []).map((p) => ({ property: p.property, name: p.displayName })),
  }));
}

const propertyPath = (v) => {
  const id = String(v || "").replace(/^properties\//, "");
  if (!/^\d{4,20}$/.test(id)) throw new HttpError(400, "Pick a property");
  return `properties/${id}`;
};

/** A property's web streams (each has a Measurement ID). */
async function streams(prisma, storeId, property) {
  const json = await call(prisma, storeId, "analytics", "GET", ADMIN, `/v1beta/${propertyPath(property)}/dataStreams?pageSize=50`);
  return (json.dataStreams || []).filter((d) => d.type === "WEB_DATA_STREAM").map((d) => ({ name: d.displayName, measurementId: d.webStreamData?.measurementId, uri: d.webStreamData?.defaultUri || null }));
}

async function createStream(prisma, store, property) {
  const d = await call(prisma, store.id, "analytics", "POST", ADMIN, `/v1beta/${propertyPath(property)}/dataStreams`, {
    type: "WEB_DATA_STREAM",
    displayName: `${store.name} — online store`.slice(0, 100),
    webStreamData: { defaultUri: storefrontUrl(store, "/").replace(/\/$/, "") },
  });
  return { name: d.displayName, measurementId: d.webStreamData?.measurementId };
}

/** Uses a stream: its Measurement ID goes on the store. */
async function useStream(prisma, store, { property, propertyName, measurementId }) {
  if (!GA_ID.test(String(measurementId || ""))) throw new HttpError(400, "That stream has no Measurement ID.");
  return saveSettings(prisma, store.id, { measurementId, property: propertyPath(property), propertyName: propertyName || null });
}

/** A new GA4 property (and web stream) for the store, in this account. */
async function createProperty(prisma, store, account) {
  if (!/^accounts\/\d{4,20}$/.test(String(account || ""))) throw new HttpError(400, "Pick an Analytics account");
  const p = await call(prisma, store.id, "analytics", "POST", ADMIN, "/v1beta/properties", {
    parent: account,
    displayName: store.name.slice(0, 100),
    timeZone: "Asia/Kolkata",
    currencyCode: store.currency || "INR",
    industryCategory: "SHOPPING",
  });
  const stream = await createStream(prisma, store, p.name);
  return useStream(prisma, store, { property: p.name, propertyName: p.displayName, measurementId: stream.measurementId });
}

/** No Analytics account yet: Google's sign-up (its terms), which comes
 * back to the admin; then the account shows up here. */
async function signUpUrl(prisma, store) {
  const redirectUri = `${env.ADMIN_ORIGIN.replace(/\/$/, "")}/admin/apps/google-analytics`;
  const t = await call(prisma, store.id, "analytics", "POST", ADMIN, "/v1beta/accounts:provisionAccountTicket", {
    account: { displayName: store.name.slice(0, 100), regionCode: "IN" },
    redirectUri,
  });
  if (!t.accountTicketId) throw new HttpError(502, "Google didn't start the sign-up. Try again.");
  return { url: `https://analytics.google.com/analytics/web/?provisioningSignup=false#/termsofservice/${encodeURIComponent(t.accountTicketId)}` };
}

/** Links a Google Ads account to the GA4 property (conversions and
 * audiences flow to Ads). */
async function linkAds(prisma, store, customerIdInput) {
  const customerId = String(customerIdInput || "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(customerId)) throw new HttpError(400, "Enter the 10-digit Google Ads customer ID (top right in Google Ads, like 123-456-7890).");
  const row = await installRow(prisma, store.id);
  const property = row?.settings?.property;
  if (!property) throw new HttpError(400, "Connect a Google Analytics property first.");
  try {
    await call(prisma, store.id, "analytics", "POST", ADMIN, `/v1beta/${property}/googleAdsLinks`, { customerId });
  } catch (err) {
    if (!/already exists|ALREADY_EXISTS/i.test(err.message || "")) throw err;
  }
  return saveSettings(prisma, store.id, { adsCustomerId: customerId });
}

// ── Tag Manager ──────────────────────────────────────────────────────

/** Tag Manager accounts and their web containers. */
async function gtmContainers(prisma, storeId) {
  const json = await call(prisma, storeId, "tagmanager", "GET", GTM, "/tagmanager/v2/accounts");
  const accounts = json.account || [];
  return Promise.all(
    accounts.slice(0, 20).map(async (a) => {
      const c = await call(prisma, storeId, "tagmanager", "GET", GTM, `/tagmanager/v2/${a.path}/containers`).catch(() => ({}));
      return { account: a.path, name: a.name, containers: (c.container || []).filter((x) => (x.usageContext || []).includes("web")).map((x) => ({ id: x.publicId, name: x.name })) };
    })
  );
}

async function useContainer(prisma, store, { id, name }) {
  if (!GTM_ID.test(String(id || ""))) throw new HttpError(400, "That isn't a Tag Manager container ID (GTM-…).");
  return saveSettings(prisma, store.id, { gtmId: String(id).toUpperCase(), gtmName: name || null });
}

async function createContainer(prisma, store, account) {
  if (!/^accounts\/\d{4,20}$/.test(String(account || ""))) throw new HttpError(400, "Pick a Tag Manager account");
  const host = new URL(storefrontUrl(store, "/")).hostname;
  const c = await call(prisma, store.id, "tagmanager", "POST", GTM, `/tagmanager/v2/${account}/containers`, { name: store.name.slice(0, 100), usageContext: ["web"], domainName: [host] });
  return useContainer(prisma, store, { id: c.publicId, name: c.name });
}

// ── Typed in by hand ─────────────────────────────────────────────────

const manualSchema = z.object({
  measurementId: z.string().trim().refine((v) => !v || GA_ID.test(v), "A Measurement ID looks like G-XXXXXXXXXX").optional(),
  gtmId: z.string().trim().refine((v) => !v || GTM_ID.test(v), "A container ID looks like GTM-XXXXXXX").optional(),
  adsConversionId: z.string().trim().refine((v) => !v || ADS_ID.test(v), "A conversion ID looks like AW-123456789").optional(),
  adsConversionLabel: z.string().trim().refine((v) => !v || ADS_LABEL.test(v), "Copy the conversion label from Google Ads").optional(),
});

async function saveManual(prisma, store, input) {
  const body = manualSchema.parse(input || {});
  const patch = {};
  for (const [k, v] of Object.entries(body)) if (v !== undefined) patch[k] = k === "adsConversionLabel" ? v : v.toUpperCase();
  return saveSettings(prisma, store.id, patch);
}

module.exports = { APP_KEY, forAdmin, analyticsAccounts, streams, createStream, useStream, createProperty, signUpUrl, linkAds, gtmContainers, useContainer, createContainer, saveManual };
