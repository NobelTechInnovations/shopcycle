const { HttpError } = require("@shopcycle/utils");
const repository = require("./repository");

async function listForStore(prisma, storeId) {
  const [catalog, installs] = await Promise.all([
    repository.listCatalog(prisma),
    repository.listInstalledForStore(prisma, storeId),
  ]);
  const installedByAppId = Object.fromEntries(installs.map((i) => [i.appId, i]));
  return catalog.map((app) => ({
    ...app,
    installed: Boolean(installedByAppId[app.id]),
    settings: installedByAppId[app.id]?.settings || {},
  }));
}

async function installApp(prisma, storeId, key, settings) {
  const app = await repository.findAppByKey(prisma, key);
  if (!app) throw new HttpError(404, "App not found");
  await repository.upsertInstall(prisma, storeId, app.id, settings);
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
