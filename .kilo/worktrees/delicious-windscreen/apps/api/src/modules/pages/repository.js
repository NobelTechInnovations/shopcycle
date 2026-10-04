function list(prisma, storeId, { page, pageSize }) {
  return Promise.all([
    prisma.page.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.page.count({ where: { storeId } }),
  ]);
}

function findById(prisma, storeId, id) {
  return prisma.page.findFirst({ where: { id, storeId } });
}

function findBySlug(prisma, storeId, slug, excludeId) {
  return prisma.page.findFirst({ where: { storeId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) } });
}

function findActiveBySlug(prisma, storeId, slug) {
  return prisma.page.findFirst({ where: { storeId, slug, status: "active" } });
}

function create(prisma, storeId, data, slug) {
  return prisma.page.create({ data: { ...data, storeId, slug } });
}

function update(prisma, id, data, slug) {
  return prisma.page.update({ where: { id }, data: { ...data, ...(slug ? { slug } : {}) } });
}

function remove(prisma, id) {
  return prisma.page.delete({ where: { id } });
}

module.exports = { list, findById, findBySlug, findActiveBySlug, create, update, remove };
