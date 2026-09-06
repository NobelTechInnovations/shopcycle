function list(prisma, storeId) {
  return prisma.taxRate.findMany({ where: { storeId }, orderBy: { createdAt: "asc" } });
}

function findById(prisma, storeId, id) {
  return prisma.taxRate.findFirst({ where: { id, storeId } });
}

function create(prisma, storeId, data) {
  return prisma.taxRate.create({ data: { ...data, storeId } });
}

function update(prisma, id, data) {
  return prisma.taxRate.update({ where: { id }, data });
}

function remove(prisma, id) {
  return prisma.taxRate.delete({ where: { id } });
}

/** The cart's tax estimate — first configured rate for the store, same
 * "no checkout address yet" simplification as shipping. */
function findFirst(prisma, storeId) {
  return prisma.taxRate.findFirst({ where: { storeId }, orderBy: { createdAt: "asc" } });
}

module.exports = { list, findById, create, update, remove, findFirst };
