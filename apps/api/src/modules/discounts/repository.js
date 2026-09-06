function list(prisma, storeId, { page, pageSize }) {
  return Promise.all([
    prisma.discount.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.discount.count({ where: { storeId } }),
  ]);
}

function findById(prisma, storeId, id) {
  return prisma.discount.findFirst({ where: { id, storeId } });
}

function findByCode(prisma, storeId, code, excludeId) {
  return prisma.discount.findFirst({
    where: { storeId, code, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

function create(prisma, storeId, data) {
  return prisma.discount.create({ data: { ...data, storeId } });
}

function update(prisma, id, data) {
  return prisma.discount.update({ where: { id }, data });
}

function remove(prisma, id) {
  return prisma.discount.delete({ where: { id } });
}

function incrementUsage(prisma, id) {
  return prisma.discount.update({ where: { id }, data: { usageCount: { increment: 1 } } });
}

module.exports = { list, findById, findByCode, create, update, remove, incrementUsage };
