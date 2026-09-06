const include = {
  customer: true,
  items: true,
};

function list(prisma, storeId, { status, page, pageSize }) {
  const where = {
    storeId,
    ...(status !== "all" ? { fulfillmentStatus: status } : {}),
  };

  return Promise.all([
    prisma.order.findMany({
      where,
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);
}

function findById(prisma, storeId, id) {
  return prisma.order.findFirst({ where: { id, storeId }, include });
}

function nextOrderNumber(prisma, storeId) {
  return prisma.order.count({ where: { storeId } }).then((count) => 1000 + count + 1);
}

function create(prisma, storeId, orderNumber, data, items) {
  return prisma.order.create({
    data: { ...data, storeId, orderNumber, items: { create: items } },
    include,
  });
}

function updateStatus(prisma, id, data) {
  return prisma.order.update({ where: { id }, data, include });
}

module.exports = { list, findById, nextOrderNumber, create, updateStatus };
