const include = {
  variants: { orderBy: { createdAt: "asc" } },
  images: { orderBy: { position: "asc" } },
  collectionProducts: { include: { collection: true } },
};

function list(prisma, storeId, { q, status, page, pageSize }) {
  const where = {
    storeId,
    ...(status ? { status } : {}),
    ...(q ? { title: { contains: q } } : {}),
  };

  return Promise.all([
    prisma.product.findMany({
      where,
      include: { variants: true, images: { orderBy: { position: "asc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);
}

function findById(prisma, storeId, id) {
  return prisma.product.findFirst({ where: { id, storeId }, include });
}

function count(prisma, storeId) {
  return prisma.product.count({ where: { storeId } });
}

function findBySlug(prisma, storeId, slug, excludeId) {
  return prisma.product.findFirst({
    where: { storeId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

function create(prisma, storeId, { variants, images, collectionIds, ...data }, slug) {
  return prisma.product.create({
    data: {
      ...data,
      storeId,
      slug,
      variants: { create: variants },
      images: { create: images },
      collectionProducts: {
        create: collectionIds.map((collectionId) => ({ collectionId })),
      },
    },
    include,
  });
}

async function update(prisma, id, { variants, images, collectionIds, ...data }, slug) {
  return prisma.$transaction(async (tx) => {
    if (variants) {
      await tx.productVariant.deleteMany({ where: { productId: id } });
    }
    if (images) {
      await tx.productImage.deleteMany({ where: { productId: id } });
    }
    if (collectionIds) {
      await tx.collectionProduct.deleteMany({ where: { productId: id } });
    }

    return tx.product.update({
      where: { id },
      data: {
        ...data,
        ...(slug ? { slug } : {}),
        ...(variants ? { variants: { create: variants } } : {}),
        ...(images ? { images: { create: images } } : {}),
        ...(collectionIds
          ? { collectionProducts: { create: collectionIds.map((collectionId) => ({ collectionId })) } }
          : {}),
      },
      include,
    });
  });
}

function remove(prisma, id) {
  return prisma.product.delete({ where: { id } });
}

module.exports = { list, findById, findBySlug, count, create, update, remove };
