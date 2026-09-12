function findByStore(prisma, storeId) {
  return prisma.metaConnection.findUnique({ where: { storeId } });
}

function upsert(prisma, storeId, data) {
  return prisma.metaConnection.upsert({
    where: { storeId },
    update: data,
    create: { storeId, ...data },
  });
}

function remove(prisma, storeId) {
  return prisma.metaConnection.delete({ where: { storeId } }).catch(() => null);
}

module.exports = { findByStore, upsert, remove };
