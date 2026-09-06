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

function upsertInstall(prisma, storeId, appId, settings) {
  return prisma.storeApp.upsert({
    where: { storeId_appId: { storeId, appId } },
    update: { settings },
    create: { storeId, appId, settings },
  });
}

function removeInstall(prisma, storeId, appId) {
  return prisma.storeApp.delete({ where: { storeId_appId: { storeId, appId } } });
}

module.exports = { listCatalog, findAppByKey, listInstalledForStore, findInstall, upsertInstall, removeInstall };
