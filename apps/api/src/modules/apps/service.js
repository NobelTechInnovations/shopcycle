const { HttpError } = require("@shopcycle/utils");
const repository = require("./repository");
const entitlements = require("../billing/entitlements");
const subscriptions = require("../billing/subscriptions");
const appCharges = require("../billing/app-charges");
const { num } = require("../billing/money");

/** Catalog apps a plan has to include, keyed by App.key → the feature
 * (billing/catalog.js) that unlocks them. Their API modules are gated too
 * (requirePlanFeature in plugins/jwt-auth.js); this stops the install
 * itself and tells the Apps page which cards to badge. */
const PLAN_APPS = {
  "meta-ads": "marketing_tools",
  whatsapp: "marketing_tools",
};

function lockedFor(ent, appKey) {
  const feature = PLAN_APPS[appKey];
  return Boolean(feature && !entitlements.has(ent, feature));
}

async function listForStore(prisma, store) {
  const [catalog, installs, ent] = await Promise.all([
    repository.listCatalog(prisma),
    repository.listInstalledForStore(prisma, store.id),
    entitlements.forStore(prisma, store.id),
  ]);
  const installedByAppId = Object.fromEntries(installs.map((i) => [i.appId, i]));
  return catalog.map((app) => ({
    ...app,
    installed: Boolean(installedByAppId[app.id]),
    settings: installedByAppId[app.id]?.settings || {},
    premium: Boolean(PLAN_APPS[app.key]),
    locked: lockedFor(ent, app.key),
    priceMonthly: num(app.priceMonthly) > 0 ? num(app.priceMonthly) : null,
  }));
}

async function installApp(prisma, store, key, settings, { role } = {}) {
  const app = await repository.findAppByKey(prisma, key);
  if (!app) throw new HttpError(404, "App not found");
  if (lockedFor(await entitlements.forStore(prisma, store.id), key)) {
    throw new HttpError(403, `${app.name} is part of the Growth and Pro plans. Upgrade in Settings ▸ Plan & billing to install it.`, {
      code: "plan_upgrade_required",
    });
  }
  const paid = num(app.priceMonthly) > 0;
  if (paid && role === "staff") throw new HttpError(403, "Only the store owner or an admin can install paid apps.");
  await repository.upsertInstall(prisma, store.id, app.id, settings);
  let chargedFrom = null;
  if (paid) {
    const sub = await subscriptions.forStore(prisma, store);
    chargedFrom = await appCharges.onInstall(prisma, store, sub, app);
  }
  return { ...app, priceMonthly: paid ? num(app.priceMonthly) : null, installed: true, settings, chargedFrom };
}

async function uninstallApp(prisma, storeId, key) {
  const app = await repository.findAppByKey(prisma, key);
  if (!app) throw new HttpError(404, "App not found");
  const install = await repository.findInstall(prisma, storeId, app.id);
  if (!install) throw new HttpError(404, "This app isn't installed");
  await repository.removeInstall(prisma, storeId, app.id);
}

/** Used by storefront/service.js to build the `apps` Liquid global — only
 * installed apps, keyed by their stable `key` (e.g. `apps["google-analytics"]`
 * in a theme), value is exactly what the merchant filled in at install. */
async function getInstalledAppsContext(prisma, storeId) {
  const installs = await prisma.storeApp.findMany({ where: { storeId }, include: { app: true } });
  return Object.fromEntries(installs.map((i) => [i.app.key, i.settings]));
}

/** Gate for a dedicated-panel app's own routes (Meta Ads, WhatsApp — see
 * their routes.js) — these aren't generic settingsSchema installs, they're
 * full API modules of their own, so "is it installed" has to be checked
 * explicitly per request rather than the generic install/settings flow
 * covering it. Throws the same shape of error requireActiveSubscription
 * does, so the admin app's existing error handling needs nothing new. */
async function assertInstalled(prisma, storeId, key) {
  const app = await repository.findAppByKey(prisma, key);
  const install = app && (await repository.findInstall(prisma, storeId, app.id));
  if (!install) {
    throw new HttpError(402, `Install the ${app?.name || key} app first.`, { appKey: key });
  }
}

module.exports = { listForStore, installApp, uninstallApp, getInstalledAppsContext, assertInstalled };
