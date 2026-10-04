const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const storefrontService = require("../storefront/service");
const cartService = require("./service");
const { throttle } = require("../../lib/throttle");

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("").transform(() => null));

const mutateSchema = z.object({
  cartId: z.string().optional(),
  variantId: z.string().min(1).optional(),
  quantity: z.coerce.number().int(),
  // Which line (rental lines share a variant); see cart/service.js lineKey.
  lineKey: z.string().max(200).optional().nullable(),
  // Rentals app: the dates and how the piece travels.
  rentalStart: day,
  rentalEnd: day,
  rentalHandover: z.enum(["delivery", "store_pickup"]).optional().nullable().or(z.literal("").transform(() => null)),
  rentalReturn: z.enum(["collect", "drop_off"]).optional().nullable().or(z.literal("").transform(() => null)),
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
  const cart = await cartService.getCart(request.server.prisma, store.id, cartId, store.handle);
  reply.send({ cart });
}

async function addHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const { cartId, variantId, quantity, rentalStart, rentalEnd, rentalHandover, rentalReturn } = mutateSchema.parse(request.body);
  if (!variantId) throw new HttpError(400, "Choose an option first.");
  const rental = rentalStart ? { start: rentalStart, end: rentalEnd || rentalStart, handover: rentalHandover || undefined, returnMethod: rentalReturn || undefined } : null;
  const cart = await cartService.addItem(
    request.server.prisma,
    store.id,
    cartId,
    variantId,
    Math.min(99, Math.max(1, quantity)),
    store.handle,
    { rental }
  );
  reply.send({ cart });
}

async function updateHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const { cartId, variantId, quantity, lineKey } = mutateSchema.parse(request.body);
  if (!variantId && !lineKey) throw new HttpError(400, "Which item?");
  const cart = await cartService.updateItem(
    request.server.prisma,
    store.id,
    cartId,
    variantId,
    Math.min(99, quantity),
    store.handle,
    { key: lineKey || null }
  );
  reply.send({ cart });
}

async function applyDiscountHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const { cartId, code } = discountSchema.parse(request.body);
  const cart = await cartService.applyDiscountCode(
    request.server.prisma,
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
  const cart = await cartService.removeDiscountCode(request.server.prisma, store.id, cartId, store.handle);
  reply.send({ cart });
}

const giftCardSchema = z.object({
  cartId: z.string().optional(),
  code: z.string().trim().min(1, "Enter a gift card code").max(40),
});

async function applyGiftCardHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const { cartId, code } = giftCardSchema.parse(request.body);
  // ~80-bit codes can't be guessed, but cap attempts per cart anyway.
  await throttle(request.server, `gift-card:${store.id}:${cartId || "none"}`, { max: 10, windowSeconds: 10 * 60 });
  const cart = await cartService.applyGiftCard(request.server.prisma, store.id, cartId, code, store.handle);
  reply.send({ cart });
}

async function removeGiftCardHandler(request, reply) {
  const store = await storefrontService.loadStoreOrThrow(request.server.prisma, request.params.handle);
  const { cartId } = removeDiscountSchema.parse(request.body);
  const cart = await cartService.removeGiftCard(request.server.prisma, store.id, cartId, store.handle);
  reply.send({ cart });
}

module.exports = {
  getHandler,
  addHandler,
  updateHandler,
  applyDiscountHandler,
  removeDiscountHandler,
  applyGiftCardHandler,
  removeGiftCardHandler,
};
