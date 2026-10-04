const { createTaxRateSchema, updateTaxRateSchema } = require("@shopcycle/validation");
const service = require("./service");

async function listHandler(request, reply) {
  const rates = await service.listTaxRates(request.server.prisma, request.store.id);
  reply.send({ rates });
}

async function createHandler(request, reply) {
  const body = createTaxRateSchema.parse(request.body);
  const rate = await service.createTaxRate(request.server.prisma, request.store.id, body);
  reply.code(201).send({ rate });
}

async function updateHandler(request, reply) {
  const body = updateTaxRateSchema.parse(request.body);
  const rate = await service.updateTaxRate(request.server.prisma, request.store.id, request.params.id, body);
  reply.send({ rate });
}

async function deleteHandler(request, reply) {
  await service.deleteTaxRate(request.server.prisma, request.store.id, request.params.id);
  reply.code(204).send();
}

module.exports = { listHandler, createHandler, updateHandler, deleteHandler };
