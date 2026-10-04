const { createPageSchema, updatePageSchema, listPagesQuerySchema } = require("@shopcycle/validation");
const service = require("./service");

async function listHandler(request, reply) {
  const query = listPagesQuerySchema.parse(request.query);
  const result = await service.listPages(request.server.prisma, request.store.id, query);
  reply.send(result);
}

async function getHandler(request, reply) {
  const page = await service.getPage(request.server.prisma, request.store.id, request.params.id);
  reply.send({ page });
}

async function createHandler(request, reply) {
  const body = createPageSchema.parse(request.body);
  const page = await service.createPage(request.server.prisma, request.store.id, body);
  reply.code(201).send({ page });
}

async function updateHandler(request, reply) {
  const body = updatePageSchema.parse(request.body);
  const page = await service.updatePage(request.server.prisma, request.store.id, request.params.id, body);
  reply.send({ page });
}

async function deleteHandler(request, reply) {
  await service.deletePage(request.server.prisma, request.store.id, request.params.id);
  reply.code(204).send();
}

module.exports = { listHandler, getHandler, createHandler, updateHandler, deleteHandler };
