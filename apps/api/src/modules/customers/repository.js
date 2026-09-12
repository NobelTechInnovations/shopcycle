const platformCustomersService = require("../platform-customers/service");

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

/** Every Customer row gets linked to its cross-store PlatformCustomer
 * identity right here, at the one place both checkout and the admin's own
 * "add customer" form end up calling — see platform-customers/service.js
 * #linkCustomer for the matching rules. A store's own admin never sees
 * this id; it only matters to super-admin's cross-store marketing view. */
async function create(prisma, storeId, data) {
  const platformCustomerId = await platformCustomersService.linkCustomer(prisma, null, data);
  return prisma.customer.create({ data: { ...data, storeId, platformCustomerId } });
}

async function update(prisma, id, data) {
  if (data.phone) {
    const current = await prisma.customer.findUnique({ where: { id }, select: { platformCustomerId: true } });
    const platformCustomerId = await platformCustomersService.linkCustomer(prisma, current?.platformCustomerId, data);
    return prisma.customer.update({ where: { id }, data: { ...data, platformCustomerId } });
  }
  return prisma.customer.update({ where: { id }, data });
}

function remove(prisma, id) {
  return prisma.customer.delete({ where: { id } });
}

module.exports = { list, findById, findByEmail, create, update, remove };
