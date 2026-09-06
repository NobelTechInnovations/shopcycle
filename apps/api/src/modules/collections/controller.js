const {
  createCollectionSchema,
  updateCollectionSchema,
  listCollectionsQuerySchema,
} = require("@shopcycle/validation");
const service = require("./service");

async function listHandler(request, reply) {
  const query = listCollectionsQuerySchema.parse(request.query);
  const result = await service.listCollections(request.server.prisma, request.store.id, query);
  reply.send(result);
}

async function getHandler(request, reply) {
  const collection = await service.getCollection(request.server.prisma, request.store.id, request.params.id);
  reply.send({ collection });
}

async function createHandler(request, reply) {
  const body = createCollectionSchema.parse(request.body);
  const collection = await service.createCollection(request.server.prisma, request.store.id, body);
  reply.code(201).send({ collection });
}

async function updateHandler(request, reply) {
  const body = updateCollectionSchema.parse(request.body);
  const collection = await service.updateCollection(
    request.server.prisma,
    request.store.id,
    request.params.id,
    body
  );
  reply.send({ collection });
}

async function deleteHandler(request, reply) {
  await service.deleteCollection(request.server.prisma, request.store.id, request.params.id);
  reply.code(204).send();
}

module.exports = { listHandler, getHandler, createHandler, updateHandler, deleteHandler };
