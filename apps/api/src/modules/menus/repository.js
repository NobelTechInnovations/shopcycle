const include = { items: { orderBy: { position: "asc" } } };

function list(prisma, storeId) {
  return prisma.menu.findMany({ where: { storeId }, include, orderBy: { createdAt: "asc" } });
}

function findById(prisma, storeId, id) {
  return prisma.menu.findFirst({ where: { id, storeId }, include });
}

function findByHandle(prisma, storeId, handle, excludeId) {
  return prisma.menu.findFirst({ where: { storeId, handle, ...(excludeId ? { id: { not: excludeId } } : {}) } });
}

function create(prisma, storeId, { items, ...data }) {
  return prisma.menu.create({
    data: {
      ...data,
      storeId,
      items: { create: items.map((item, position) => ({ label: item.label, url: item.url, position })) },
    },
    include,
  });
}

async function update(prisma, id, { items, ...data }) {
  return prisma.$transaction(async (tx) => {
    if (items) {
      await tx.menuItem.deleteMany({ where: { menuId: id } });
    }
    return tx.menu.update({
      where: { id },
      data: {
        ...data,
        ...(items
          ? { items: { create: items.map((item, position) => ({ label: item.label, url: item.url, position })) } }
          : {}),
      },
      include,
    });
  });
}

function remove(prisma, id) {
  return prisma.menu.delete({ where: { id } });
}

module.exports = { list, findById, findByHandle, create, update, remove };
