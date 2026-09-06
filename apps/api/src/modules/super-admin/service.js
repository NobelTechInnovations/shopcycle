const { HttpError } = require("@shopcycle/utils");
const repository = require("./repository");

async function listCompanies(prisma) {
  const stores = await repository.listCompanies(prisma);
  return stores.map((s) => ({
    id: s.id,
    name: s.name,
    handle: s.handle,
    domain: s.domain,
    status: s.status,
    plan: s.plan ? { id: s.plan.id, name: s.plan.name } : null,
    owner: s.storeUsers[0]?.user || null,
    orderCount: s._count.orders,
    productCount: s._count.products,
    createdAt: s.createdAt,
  }));
}

async function updateCompanyStatus(prisma, id, status) {
  return repository.updateCompanyStatus(prisma, id, status);
}

function listPlans(prisma) {
  return repository.listPlans(prisma);
}

async function createPlan(prisma, input) {
  return repository.createPlan(prisma, input);
}

async function updatePlan(prisma, id, input) {
  const plan = await repository.findPlanById(prisma, id);
  if (!plan) throw new HttpError(404, "Plan not found");
  return repository.updatePlan(prisma, id, input);
}

async function deletePlan(prisma, id) {
  const plan = await repository.findPlanById(prisma, id);
  if (!plan) throw new HttpError(404, "Plan not found");
  const storeCount = await repository.countStoresOnPlan(prisma, id);
  if (storeCount > 0) {
    throw new HttpError(400, `${storeCount} store(s) are still on this plan — move them first.`);
  }
  await repository.deletePlan(prisma, id);
}

function listApps(prisma) {
  return repository.listApps(prisma);
}

async function createApp(prisma, input) {
  const existing = await repository.findAppByKey(prisma, input.key);
  if (existing) throw new HttpError(409, `An app with key "${input.key}" already exists`);
  return repository.createApp(prisma, input);
}

async function updateApp(prisma, id, input) {
  const app = await repository.findAppById(prisma, id);
  if (!app) throw new HttpError(404, "App not found");
  return repository.updateApp(prisma, id, input);
}

async function deleteApp(prisma, id) {
  const app = await repository.findAppById(prisma, id);
  if (!app) throw new HttpError(404, "App not found");
  await repository.deleteApp(prisma, id);
}

module.exports = {
  listCompanies,
  updateCompanyStatus,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  listApps,
  createApp,
  updateApp,
  deleteApp,
};
