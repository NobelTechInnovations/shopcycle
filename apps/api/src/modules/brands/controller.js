const { createBrandSchema, updateBrandSchema, listBrandsQuerySchema } = require("@shopcycle/validation");
const service = require("./service");

async function listHandler(request, reply) {
  const query = listBrandsQuerySchema.parse(request.query);
  const result = await service.listBrands(request.server.prisma, request.store.id, query);
  reply.send(result);
}

async function getHandler(request, reply) {
  const brand = await service.getBrand(request.server.prisma, request.store.id, request.params.id);
  reply.send({ brand });
}

async function createHandler(request, reply) {
  const body = createBrandSchema.parse(request.body);
  const brand = await service.createBrand(request.server.prisma, request.store.id, body);
  reply.code(201).send({ brand });
}

async function updateHandler(request, reply) {
  const body = updateBrandSchema.parse(request.body);
  const brand = await service.updateBrand(request.server.prisma, request.store.id, request.params.id, body);
  reply.send({ brand });
}

async function deleteHandler(request, reply) {
  await service.deleteBrand(request.server.prisma, request.store.id, request.params.id);
  reply.code(204).send();
}

module.exports = { listHandler, getHandler, createHandler, updateHandler, deleteHandler };
