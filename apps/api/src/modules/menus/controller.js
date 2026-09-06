const { createMenuSchema, updateMenuSchema } = require("@shopcycle/validation");
const service = require("./service");

async function listHandler(request, reply) {
  const menus = await service.listMenus(request.server.prisma, request.store.id);
  reply.send({ menus });
}

async function getHandler(request, reply) {
  const menu = await service.getMenu(request.server.prisma, request.store.id, request.params.id);
  reply.send({ menu });
}

async function createHandler(request, reply) {
  const body = createMenuSchema.parse(request.body);
  const menu = await service.createMenu(request.server.prisma, request.store.id, body);
  reply.code(201).send({ menu });
}

async function updateHandler(request, reply) {
  const body = updateMenuSchema.parse(request.body);
  const menu = await service.updateMenu(request.server.prisma, request.store.id, request.params.id, body);
  reply.send({ menu });
}

async function deleteHandler(request, reply) {
  await service.deleteMenu(request.server.prisma, request.store.id, request.params.id);
  reply.code(204).send();
}

module.exports = { listHandler, getHandler, createHandler, updateHandler, deleteHandler };
