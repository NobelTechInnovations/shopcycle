const { z } = require("zod");
const service = require("./service");

async function objectivesHandler(request, reply) {
  reply.send({
    objectives: Object.entries(service.OBJECTIVES).map(([key, o]) => ({ key, label: o.label })),
  });
}

async function listHandler(request, reply) {
  const campaigns = await service.listCampaigns(request.server.prisma, request.store);
  reply.send({ campaigns });
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  objectivePreset: z.enum(["traffic", "engagement"]),
  dailyBudget: z.number().positive(),
  countryCode: z.string().length(2).optional(),
  primaryText: z.string().min(1).max(500),
  headline: z.string().min(1).max(80),
  destinationUrl: z.string().url(),
  imageUrl: z.string().url(),
});

async function createHandler(request, reply) {
  const input = createSchema.parse(request.body);
  const campaign = await service.createCampaign(request.server.prisma, request.store, input);
  reply.code(201).send({ campaign });
}

const statusSchema = z.object({ status: z.enum(["ACTIVE", "PAUSED"]) });

async function statusHandler(request, reply) {
  const { status } = statusSchema.parse(request.body);
  await service.setCampaignStatus(request.server.prisma, request.store, request.params.id, status);
  reply.send({ ok: true });
}

module.exports = { objectivesHandler, listHandler, createHandler, statusHandler };
