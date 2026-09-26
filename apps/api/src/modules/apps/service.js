const { HttpError } = require("@shopcycle/utils");
const repository = require("./repository");

/** Catalog apps that only Premium includes, keyed by App.key → the Plan
 * flag that unlocks them. Their API modules are gated too (see
 * requirePlanFeature in plugins/jwt-auth.js); this stops the install
 * itself and tells the Apps page which cards to badge. */
const PREMIUM_APPS = {
  "meta-ads": "hasMetaAds",
  whatsapp: "hasWhatsappIntegration",
};

function lockedFor(store, appKey) {
  const flag = PREMIUM_APPS[appKey];
  return Boolean(flag && !store?.plan?.[flag]);
}

async function listForStore(prisma, store) {
  const [catalog, installs] = await Promise.all([
    repository.listCatalog(prisma),
    repository.listInstalledForStore(prisma, store.id),
  ]);
  const installedByAppId = Object.fromEntries(installs.map((i) => [i.appId, i]));
  return catalog.map((app) => ({
    ...app,
    installed: Boolean(installedByAppId[app.id]),
    settings: installedByAppId[app.id]?.settings || {},
    premium: Boolean(PREMIUM_APPS[app.key]),
    locked: lockedFor(store, app.key),
  }));
}

async function installApp(prisma, store, key, settings) {
  const app = await repository.findAppByKey(prisma, key);
  if (!app) throw new HttpError(404, "App not found");
  if (lockedFor(store, key)) {
    throw new HttpError(403, `${app.name} is part of the Premium plan. Upgrade in Settings › Billing to install it.`, {
      code: "plan_upgrade_required",
    });
  }
  await repository.upsertInstall(prisma, store.id, app.id, settings);
  return { ...app, installed: true, settings };
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
