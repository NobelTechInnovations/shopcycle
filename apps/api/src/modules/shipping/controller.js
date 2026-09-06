const {
  createShippingZoneSchema,
  updateShippingZoneSchema,
  createShippingRateSchema,
  updateShippingRateSchema,
} = require("@shopcycle/validation");
const service = require("./service");

async function listZonesHandler(request, reply) {
  const zones = await service.listZones(request.server.prisma, request.store.id);
  reply.send({ zones });
}

async function getZoneHandler(request, reply) {
  const zone = await service.getZone(request.server.prisma, request.store.id, request.params.id);
  reply.send({ zone });
}

async function createZoneHandler(request, reply) {
  const body = createShippingZoneSchema.parse(request.body);
  const zone = await service.createZone(request.server.prisma, request.store.id, body);
  reply.code(201).send({ zone });
}

async function updateZoneHandler(request, reply) {
  const body = updateShippingZoneSchema.parse(request.body);
  const zone = await service.updateZone(request.server.prisma, request.store.id, request.params.id, body);
  reply.send({ zone });
}

async function deleteZoneHandler(request, reply) {
  await service.deleteZone(request.server.prisma, request.store.id, request.params.id);
  reply.code(204).send();
}

async function addRateHandler(request, reply) {
  const body = createShippingRateSchema.parse(request.body);
  const rate = await service.addRate(request.server.prisma, request.store.id, request.params.id, body);
  reply.code(201).send({ rate });
}

async function updateRateHandler(request, reply) {
  const body = updateShippingRateSchema.parse(request.body);
  const rate = await service.updateRate(
    request.server.prisma,
    request.store.id,
    request.params.id,
    request.params.rateId,
    body
  );
  reply.send({ rate });
}

async function deleteRateHandler(request, reply) {
  await service.deleteRate(request.server.prisma, request.store.id, request.params.id, request.params.rateId);
  reply.code(204).send();
}

module.exports = {
  listZonesHandler,
  getZoneHandler,
  createZoneHandler,
  updateZoneHandler,
  deleteZoneHandler,
  addRateHandler,
  updateRateHandler,
  deleteRateHandler,
};
