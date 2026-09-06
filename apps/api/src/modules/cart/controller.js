const { z } = require("zod");
const storefrontService = require("../storefront/service");
const cartService = require("./service");

const mutateSchema = z.object({
  cartId: z.string().optional(),
  variantId: z.string().min(1),
  quantity: z.coerce.number().int(),
});

const discountSchema = z.object({
  cartId: z.string().optional(),
  code: z.string().min(1),
});

const removeDiscountSchema = z.object({
  cartId: z.string().optional(),
});

async function getHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const cartId = request.query.cartId;
  const cart = await cartService.getCart(request.server.prisma, request.server.redis, store.id, cartId, store.handle);
  reply.send({ cart });
}

async function addHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const { cartId, variantId, quantity } = mutateSchema.parse(request.body);
  const cart = await cartService.addItem(
    request.server.prisma,
    request.server.redis,
    store.id,
    cartId,
    variantId,
    Math.max(1, quantity),
    store.handle
  );
  reply.send({ cart });
}

async function updateHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const { cartId, variantId, quantity } = mutateSchema.parse(request.body);
  const cart = await cartService.updateItem(
    request.server.prisma,
    request.server.redis,
    store.id,
    cartId,
    variantId,
    quantity,
    store.handle
  );
  reply.send({ cart });
}

async function applyDiscountHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const { cartId, code } = discountSchema.parse(request.body);
  const cart = await cartService.applyDiscountCode(
    request.server.prisma,
    request.server.redis,
    store.id,
    cartId,
    code,
    store.handle
  );
  reply.send({ cart });
}

async function removeDiscountHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const { cartId } = removeDiscountSchema.parse(request.body);
  const cart = await cartService.removeDiscountCode(request.server.prisma, request.server.redis, store.id, cartId, store.handle);
  reply.send({ cart });
}

module.exports = { getHandler, addHandler, updateHandler, applyDiscountHandler, removeDiscountHandler };
