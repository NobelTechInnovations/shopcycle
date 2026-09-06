const {
  createOrderSchema,
  updateOrderStatusSchema,
  listOrdersQuerySchema,
} = require("@shopcycle/validation");
const service = require("./service");

async function listHandler(request, reply) {
  const query = listOrdersQuerySchema.parse(request.query);
  const result = await service.listOrders(request.server.prisma, request.store.id, query);
  reply.send(result);
}

async function getHandler(request, reply) {
  const order = await service.getOrder(request.server.prisma, request.store.id, request.params.id);
  reply.send({ order });
}

async function createHandler(request, reply) {
  const body = createOrderSchema.parse(request.body);
  const order = await service.createOrder(request.server.prisma, request.store.id, body);
  reply.code(201).send({ order });
}

async function updateStatusHandler(request, reply) {
  const body = updateOrderStatusSchema.parse(request.body);
  const order = await service.updateOrderStatus(request.server.prisma, request.store.id, request.params.id, body);
  reply.send({ order });
}

module.exports = { listHandler, getHandler, createHandler, updateStatusHandler };
