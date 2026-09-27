const { z } = require("zod");
const { checkoutSchema, verifyRazorpayPaymentSchema } = require("@shopcycle/validation");
const storefrontService = require("../storefront/service");
const service = require("./service");
const shopperService = require("../shopper/service");

async function getHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const context = await service.getCheckoutContext(request.server.prisma, store, request.query.cartId);
  reply.send(context);
}

async function placeOrderHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const body = checkoutSchema.parse(request.body);
  const shopper = await shopperService.customerFromToken(request.server, store, request.headers["x-shopper-token"]);
  const result = await service.placeOrder(request.server.prisma, store.id, body.cartId, store.handle, body, {
    store,
    shopper,
    log: request.log,
  });
  reply.code(201).send(result);
}

/** Back from a gateway (the storefront's /checkout/return/:provider). */
async function confirmPaymentHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const body = z
    .object({
      orderId: z.string().min(1).max(40),
      cartId: z.string().max(100).optional(),
      params: z.record(z.union([z.string(), z.number()]).transform(String)).default({}),
    })
    .parse(request.body);
  const result = await service.confirmPayment(
    request.server.prisma,
    store,
    { orderId: body.orderId, provider: request.params.provider, params: body.params, cartId: body.cartId },
    { log: request.log }
  );
  reply.send({ paid: result.paid, orderId: result.order.id, message: result.message || null });
}

async function getOrderHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const order = await service.getOrderForConfirmation(request.server.prisma, store.id, request.params.id);
  reply.send({ order });
}

async function verifyHandler(request, reply) {
  const body = verifyRazorpayPaymentSchema.parse(request.body);
  const order = await service.verifyRazorpayPayment(request.server.prisma, body, { log: request.log });
  reply.send({ order });
}

module.exports = { getHandler, placeOrderHandler, getOrderHandler, verifyHandler, confirmPaymentHandler };
