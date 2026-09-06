const include = {
  products: { include: { product: true }, orderBy: { position: "asc" } },
};

function list(prisma, storeId, { q, page, pageSize }) {
  const where = {
    storeId,
    ...(q ? { title: { contains: q } } : {}),
  };

  return Promise.all([
    prisma.collection.findMany({
      where,
      include: { products: true },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.collection.count({ where }),
  ]);
}

function findById(prisma, storeId, id) {
  return prisma.collection.findFirst({ where: { id, storeId }, include });
}

function findBySlug(prisma, storeId, slug, excludeId) {
  return prisma.collection.findFirst({
    where: { storeId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

function create(prisma, storeId, { productIds, ...data }, slug) {
  return prisma.collection.create({
    data: {
      ...data,
      storeId,
      slug,
      products: { create: productIds.map((productId, position) => ({ productId, position })) },
    },
    include,
  });
}

async function update(prisma, id, { productIds, ...data }, slug) {
  return prisma.$transaction(async (tx) => {
    if (productIds) {
      await tx.collectionProduct.deleteMany({ where: { collectionId: id } });
    }
    return tx.collection.update({
      where: { id },
      data: {
        ...data,
        ...(slug ? { slug } : {}),
        ...(productIds
          ? { products: { create: productIds.map((productId, position) => ({ productId, position })) } }
          : {}),
      },
      include,
    });
  });
}

function remove(prisma, id) {
  return prisma.collection.delete({ where: { id } });
}

module.exports = { list, findById, findBySlug, create, update, remove };
