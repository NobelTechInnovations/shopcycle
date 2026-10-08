/** One page (by status as shoppers see it, and code/title search), the
 * total, and every discount's dates and usage for the tab counts. */
async function list(prisma, storeId, { page, pageSize, status = "all", q }) {
  const { effectiveStatus } = require("./service");
  const term = String(q || "").trim();
  const where = { storeId, ...(term && { OR: [{ code: { contains: term, mode: "insensitive" } }, { title: { contains: term, mode: "insensitive" } }] }) };
  const all = await prisma.discount.findMany({ where: { storeId }, select: { id: true, status: true, startsAt: true, endsAt: true, usageLimit: true, usageCount: true } });
  if (status === "all") {
    const [rows, total] = await Promise.all([prisma.discount.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), prisma.discount.count({ where })]);
    return [rows, total, all];
  }
  const ids = all.filter((d) => effectiveStatus(d) === status).map((d) => d.id);
  const filtered = { ...where, id: { in: ids } };
  const [rows, total] = await Promise.all([prisma.discount.findMany({ where: filtered, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), prisma.discount.count({ where: filtered })]);
  return [rows, total, all];
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
