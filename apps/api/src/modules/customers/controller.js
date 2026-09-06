const {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
} = require("@shopcycle/validation");
const service = require("./service");

async function listHandler(request, reply) {
  const query = listCustomersQuerySchema.parse(request.query);
  const result = await service.listCustomers(request.server.prisma, request.store.id, query);
  reply.send(result);
}

async function getHandler(request, reply) {
  const customer = await service.getCustomer(request.server.prisma, request.store.id, request.params.id);
  reply.send({ customer });
}

async function createHandler(request, reply) {
  const body = createCustomerSchema.parse(request.body);
  const customer = await service.createCustomer(request.server.prisma, request.store.id, body);
  reply.code(201).send({ customer });
}

async function updateHandler(request, reply) {
  const body = updateCustomerSchema.parse(request.body);
  const customer = await service.updateCustomer(
    request.server.prisma,
    request.store.id,
    request.params.id,
    body
  );
  reply.send({ customer });
}

async function deleteHandler(request, reply) {
  await service.deleteCustomer(request.server.prisma, request.store.id, request.params.id);
  reply.code(204).send();
}

module.exports = { listHandler, getHandler, createHandler, updateHandler, deleteHandler };
