const { createDiscountSchema, updateDiscountSchema, listDiscountsQuerySchema } = require("@shopcycle/validation");
const service = require("./service");

async function listHandler(request, reply) {
  const query = listDiscountsQuerySchema.parse(request.query);
  const result = await service.listDiscounts(request.server.prisma, request.store.id, query);
  reply.send(result);
}

async function getHandler(request, reply) {
  const discount = await service.getDiscount(request.server.prisma, request.store.id, request.params.id);
  reply.send({ discount });
}

async function createHandler(request, reply) {
  const body = createDiscountSchema.parse(request.body);
  const discount = await service.createDiscount(request.server.prisma, request.store.id, body);
  reply.code(201).send({ discount });
}

async function updateHandler(request, reply) {
  const body = updateDiscountSchema.parse(request.body);
  const discount = await service.updateDiscount(request.server.prisma, request.store.id, request.params.id, body);
  reply.send({ discount });
}

async function deleteHandler(request, reply) {
  await service.deleteDiscount(request.server.prisma, request.store.id, request.params.id);
  reply.code(204).send();
}

module.exports = { listHandler, getHandler, createHandler, updateHandler, deleteHandler };
