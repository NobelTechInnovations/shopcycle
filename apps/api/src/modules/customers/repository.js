function list(prisma, storeId, { q, page, pageSize }) {
  const where = {
    storeId,
    ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
  };

  return Promise.all([
    prisma.customer.findMany({
      where,
      include: { orders: { select: { id: true, total: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);
}

function findById(prisma, storeId, id) {
  return prisma.customer.findFirst({
    where: { id, storeId },
    include: { orders: { orderBy: { createdAt: "desc" } } },
  });
}

function findByEmail(prisma, storeId, email, excludeId) {
  return prisma.customer.findFirst({
    where: { storeId, email, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

function create(prisma, storeId, data) {
  return prisma.customer.create({ data: { ...data, storeId } });
}

function update(prisma, id, data) {
  return prisma.customer.update({ where: { id }, data });
}

function remove(prisma, id) {
  return prisma.customer.delete({ where: { id } });
}

module.exports = { list, findById, findByEmail, create, update, remove };
