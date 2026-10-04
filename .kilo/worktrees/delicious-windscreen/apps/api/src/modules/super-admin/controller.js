const {
  createPlanSchema,
  updatePlanSchema,
  createAppSchema,
  updateAppSchema,
  updateCompanyStatusSchema,
} = require("@shopcycle/validation");
const service = require("./service");

async function listCompaniesHandler(request, reply) {
  const companies = await service.listCompanies(request.server.prisma);
  reply.send({ companies });
}

async function updateCompanyStatusHandler(request, reply) {
  const { status } = updateCompanyStatusSchema.parse(request.body);
  const store = await service.updateCompanyStatus(request.server.prisma, request.params.id, status);
  reply.send({ store });
}

async function listPlansHandler(request, reply) {
  const plans = await service.listPlans(request.server.prisma);
  reply.send({ plans });
}

async function createPlanHandler(request, reply) {
  const body = createPlanSchema.parse(request.body);
  const plan = await service.createPlan(request.server.prisma, body);
  reply.code(201).send({ plan });
}

async function updatePlanHandler(request, reply) {
  const body = updatePlanSchema.parse(request.body);
  const plan = await service.updatePlan(request.server.prisma, request.params.id, body);
  reply.send({ plan });
}

async function deletePlanHandler(request, reply) {
  await service.deletePlan(request.server.prisma, request.params.id);
  reply.code(204).send();
}

async function listAppsHandler(request, reply) {
  const apps = await service.listApps(request.server.prisma);
  reply.send({ apps });
}

async function createAppHandler(request, reply) {
  const body = createAppSchema.parse(request.body);
  const app = await service.createApp(request.server.prisma, body);
  reply.code(201).send({ app });
}

async function updateAppHandler(request, reply) {
  const body = updateAppSchema.parse(request.body);
  const app = await service.updateApp(request.server.prisma, request.params.id, body);
  reply.send({ app });
}

async function deleteAppHandler(request, reply) {
  await service.deleteApp(request.server.prisma, request.params.id);
  reply.code(204).send();
}

module.exports = {
  listCompaniesHandler,
  updateCompanyStatusHandler,
  listPlansHandler,
  createPlanHandler,
  updatePlanHandler,
  deletePlanHandler,
  listAppsHandler,
  createAppHandler,
  updateAppHandler,
  deleteAppHandler,
};
