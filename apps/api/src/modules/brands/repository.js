function list(prisma, storeId, { q, page, pageSize }) {
  const where = {
    storeId,
    ...(q ? { title: { contains: q } } : {}),
  };

  return Promise.all([
    prisma.brand.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.brand.count({ where }),
  ]);
}

function findById(prisma, storeId, id) {
  return prisma.brand.findFirst({ where: { id, storeId } });
}

function findBySlug(prisma, storeId, slug, excludeId) {
  return prisma.brand.findFirst({
    where: { storeId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

function create(prisma, storeId, data, slug) {
  return prisma.brand.create({ data: { ...data, storeId, slug } });
}

function update(prisma, id, data, slug) {
  return prisma.brand.update({ where: { id }, data: { ...data, ...(slug ? { slug } : {}) } });
}

function remove(prisma, id) {
  return prisma.brand.delete({ where: { id } });
}

module.exports = { list, findById, findBySlug, create, update, remove };
