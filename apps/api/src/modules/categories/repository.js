function list(prisma, storeId, { q, page, pageSize }) {
  const where = {
    storeId,
    ...(q ? { title: { contains: q } } : {}),
  };

  return Promise.all([
    prisma.category.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.category.count({ where }),
  ]);
}

function findById(prisma, storeId, id) {
  return prisma.category.findFirst({ where: { id, storeId } });
}

function findBySlug(prisma, storeId, slug, excludeId) {
  return prisma.category.findFirst({
    where: { storeId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

function create(prisma, storeId, data, slug) {
  return prisma.category.create({ data: { ...data, storeId, slug } });
}

function update(prisma, id, data, slug) {
  return prisma.category.update({ where: { id }, data: { ...data, ...(slug ? { slug } : {}) } });
}

function remove(prisma, id) {
  return prisma.category.delete({ where: { id } });
}

module.exports = { list, findById, findBySlug, create, update, remove };
