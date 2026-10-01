const include = { items: { orderBy: { position: "asc" } } };

/** Rows to create, in order. A link is never more than one level deeper
 * than the link above it (the first is always top level). */
function itemRows(items) {
  let prev = -1;
  return items.map((item, position) => {
    const depth = Math.max(0, Math.min(Number(item.depth) || 0, prev + 1, 2));
    prev = depth;
    return { label: item.label, url: item.url, position, depth };
  });
}

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
      items: { create: itemRows(items) },
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
          ? { items: { create: itemRows(items) } }
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
