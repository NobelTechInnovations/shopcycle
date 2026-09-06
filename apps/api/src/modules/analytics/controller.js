const { createCampaignSchema, overviewQuerySchema } = require("@shopcycle/validation");
const { env } = require("../../config/env");
const service = require("./service");

async function liveHandler(request, reply) {
  const visitors = await service.getLiveVisitors(request.server.redis, request.store.id);
  reply.send({ visitors });
}

async function overviewHandler(request, reply) {
  const { range } = overviewQuerySchema.parse(request.query);
  const overview = await service.getOverview(request.server.prisma, request.store.id, range);
  reply.send(overview);
}

async function reportsHandler(request, reply) {
  const { range } = overviewQuerySchema.parse(request.query);
  const reports = await service.getReports(request.server.prisma, request.store.id, range);
  reply.send(reports);
}

function storeRootUrl(request) {
  return `${env.STOREFRONT_ORIGIN}/store/${request.store.handle}`;
}

async function listCampaignsHandler(request, reply) {
  const campaigns = await service.listCampaigns(request.server.prisma, request.store.id, storeRootUrl(request));
  reply.send({ campaigns });
}

async function createCampaignHandler(request, reply) {
  const body = createCampaignSchema.parse(request.body);
  const campaign = await service.createCampaign(request.server.prisma, request.store.id, body);
  reply.code(201).send({ campaign: { ...campaign, url: service.buildCampaignUrl(storeRootUrl(request), campaign) } });
}

async function deleteCampaignHandler(request, reply) {
  await service.deleteCampaign(request.server.prisma, request.store.id, request.params.id);
  reply.code(204).send();
}

module.exports = {
  liveHandler,
  overviewHandler,
  reportsHandler,
  listCampaignsHandler,
  createCampaignHandler,
  deleteCampaignHandler,
};
