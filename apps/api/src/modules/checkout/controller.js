const { checkoutSchema, verifyRazorpayPaymentSchema } = require("@shopcycle/validation");
const storefrontService = require("../storefront/service");
const service = require("./service");

async function getHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const context = await service.getCheckoutContext(
    request.server.prisma,
    request.server.redis,
    store.id,
    request.query.cartId,
    store.handle
  );
  reply.send(context);
}

async function placeOrderHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const body = checkoutSchema.parse(request.body);
  const result = await service.placeOrder(
    request.server.prisma,
    request.server.redis,
    store.id,
    body.cartId,
    store.handle,
    body
  );
  reply.code(201).send(result);
}

async function getOrderHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const order = await service.getOrderForConfirmation(request.server.prisma, store.id, request.params.id);
  reply.send({ order });
}

async function verifyHandler(request, reply) {
  const body = verifyRazorpayPaymentSchema.parse(request.body);
  const order = await service.verifyRazorpayPayment(request.server.prisma, body);
  reply.send({ order });
}

module.exports = { getHandler, placeOrderHandler, getOrderHandler, verifyHandler };
