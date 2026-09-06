function listCompanies(prisma) {
  return prisma.store.findMany({
    include: {
      plan: true,
      storeUsers: { where: { role: "owner" }, include: { user: { select: { name: true, email: true } } }, take: 1 },
      _count: { select: { orders: true, products: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

function updateCompanyStatus(prisma, id, status) {
  return prisma.store.update({ where: { id }, data: { status } });
}

function listPlans(prisma) {
  return prisma.plan.findMany({ orderBy: { priceMonthly: "asc" } });
}

function findPlanById(prisma, id) {
  return prisma.plan.findUnique({ where: { id } });
}

function createPlan(prisma, data) {
  return prisma.plan.create({ data });
}

function updatePlan(prisma, id, data) {
  return prisma.plan.update({ where: { id }, data });
}

function countStoresOnPlan(prisma, id) {
  return prisma.store.count({ where: { planId: id } });
}

function deletePlan(prisma, id) {
  return prisma.plan.delete({ where: { id } });
}

function listApps(prisma) {
  return prisma.app.findMany({ orderBy: { createdAt: "asc" } });
}

function findAppById(prisma, id) {
  return prisma.app.findUnique({ where: { id } });
}

function findAppByKey(prisma, key) {
  return prisma.app.findUnique({ where: { key } });
}

function createApp(prisma, data) {
  return prisma.app.create({ data });
}

function updateApp(prisma, id, data) {
  return prisma.app.update({ where: { id }, data });
}

function deleteApp(prisma, id) {
  return prisma.app.delete({ where: { id } });
}

module.exports = {
  listCompanies,
  updateCompanyStatus,
  listPlans,
  findPlanById,
  createPlan,
  updatePlan,
  countStoresOnPlan,
  deletePlan,
  listApps,
  findAppById,
  findAppByKey,
  createApp,
  updateApp,
  deleteApp,
};
