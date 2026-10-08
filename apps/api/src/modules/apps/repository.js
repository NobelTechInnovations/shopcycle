function listCatalog(prisma) {
  return prisma.app.findMany({ orderBy: { createdAt: "asc" } });
}

function findAppByKey(prisma, key) {
  return prisma.app.findUnique({ where: { key } });
}

function listInstalledForStore(prisma, storeId) {
  return prisma.storeApp.findMany({ where: { storeId } });
}

function findInstall(prisma, storeId, appId) {
  return prisma.storeApp.findUnique({ where: { storeId_appId: { storeId, appId } } });
}

/** Installs, or saves the settings form over what's there — keys the form
 * doesn't have (set by an app's own page: UPI ID, Tag Manager container,
 * GA4 property) are kept. */
async function upsertInstall(prisma, storeId, appId, settings) {
  const current = await prisma.storeApp.findUnique({ where: { storeId_appId: { storeId, appId } }, select: { settings: true } });
  const merged = { ...(current?.settings && typeof current.settings === "object" ? current.settings : {}), ...(settings || {}) };
  return prisma.storeApp.upsert({
    where: { storeId_appId: { storeId, appId } },
    update: { settings: merged },
    create: { storeId, appId, settings: settings || {} },
  });
}

function removeInstall(prisma, storeId, appId) {
  return prisma.storeApp.delete({ where: { storeId_appId: { storeId, appId } } });
}

module.exports = { listCatalog, findAppByKey, listInstalledForStore, findInstall, upsertInstall, removeInstall };
