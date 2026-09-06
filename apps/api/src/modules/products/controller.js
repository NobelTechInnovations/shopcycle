const {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
} = require("@shopcycle/validation");
const service = require("./service");

async function listHandler(request, reply) {
  const query = listProductsQuerySchema.parse(request.query);
  const result = await service.listProducts(request.server.prisma, request.store.id, query);
  reply.send(result);
}

async function getHandler(request, reply) {
  const product = await service.getProduct(request.server.prisma, request.store.id, request.params.id);
  reply.send({ product });
}

async function createHandler(request, reply) {
  const body = createProductSchema.parse(request.body);
  const product = await service.createProduct(request.server.prisma, request.store, body);
  reply.code(201).send({ product });
}

async function updateHandler(request, reply) {
  const body = updateProductSchema.parse(request.body);
  const product = await service.updateProduct(request.server.prisma, request.store.id, request.params.id, body);
  reply.send({ product });
}

async function deleteHandler(request, reply) {
  await service.deleteProduct(request.server.prisma, request.store.id, request.params.id);
  reply.code(204).send();
}

module.exports = { listHandler, getHandler, createHandler, updateHandler, deleteHandler };
