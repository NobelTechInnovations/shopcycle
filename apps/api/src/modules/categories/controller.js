const { createCategorySchema, updateCategorySchema, listCategoriesQuerySchema } = require("@shopcycle/validation");
const service = require("./service");

async function listHandler(request, reply) {
  const query = listCategoriesQuerySchema.parse(request.query);
  const result = await service.listCategories(request.server.prisma, request.store.id, query);
  reply.send(result);
}

async function getHandler(request, reply) {
  const category = await service.getCategory(request.server.prisma, request.store.id, request.params.id);
  reply.send({ category });
}

async function createHandler(request, reply) {
  const body = createCategorySchema.parse(request.body);
  const category = await service.createCategory(request.server.prisma, request.store.id, body);
  reply.code(201).send({ category });
}

async function updateHandler(request, reply) {
  const body = updateCategorySchema.parse(request.body);
  const category = await service.updateCategory(request.server.prisma, request.store.id, request.params.id, body);
  reply.send({ category });
}

async function deleteHandler(request, reply) {
  await service.deleteCategory(request.server.prisma, request.store.id, request.params.id);
  reply.code(204).send();
}

module.exports = { listHandler, getHandler, createHandler, updateHandler, deleteHandler };
