const { z } = require("zod");
const { HttpError } = require("@shopcycle/utils");
const {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
} = require("@shopcycle/validation");
const service = require("./service");
const productAi = require("./ai");
const ai = require("../../lib/ai");
const webhooks = require("../developer/webhooks");

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
  const product = await service.createProduct(request.server.prisma, request.store, body, { actorName: request.authUser?.name });
  webhooks.emit(request.server.prisma, request.store.id, "product.created", { id: product.id });
  reply.code(201).send({ product });
}

async function updateHandler(request, reply) {
  const body = updateProductSchema.parse(request.body);
  const product = await service.updateProduct(request.server.prisma, request.store.id, request.params.id, body, {
    actorName: request.authUser?.name,
  });
  webhooks.emit(request.server.prisma, request.store.id, "product.updated", { id: product.id });
  reply.send({ product });
}

async function deleteHandler(request, reply) {
  const doomed = await request.server.prisma.product.findFirst({ where: { id: request.params.id, storeId: request.store.id }, select: { id: true, title: true } });
  await service.deleteProduct(request.server.prisma, request.store.id, request.params.id);
  if (doomed) webhooks.emit(request.server.prisma, request.store.id, "product.deleted", doomed);
  reply.code(204).send();
}

const bulkSchema = z.object({
  ids: z.array(z.string().min(1).max(40)).min(1, "Select at least one product").max(250),
  action: z.enum(["activate", "draft", "archive", "delete"]),
});

async function bulkHandler(request, reply) {
  const body = bulkSchema.parse(request.body);
  if (body.action === "delete" && request.storeRole === "staff") {
    throw new HttpError(403, "Only the store owner or an admin can delete products in bulk.");
  }
  reply.send(await service.bulkProducts(request.server.prisma, request.store.id, body));
}

const aiInputSchema = z.object({
  title: z.string().max(255).optional().default(""),
  description: z.string().max(20000).optional().nullable(),
  productType: z.string().max(120).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  brand: z.string().max(120).optional().nullable(),
  tags: z.array(z.string().max(60)).max(50).optional().default([]),
});

/** POST /api/products/ai/description — the description, rewritten. */
async function aiDescriptionHandler(request, reply) {
  const body = aiInputSchema.extend({ mode: z.enum(Object.keys(productAi.MODES)).default("rewrite") }).parse(request.body || {});
  reply.send(await productAi.rewriteDescription(request.server, request.store, body));
}

/** POST /api/products/ai/suggest — a category and tags for the product. */
async function aiSuggestHandler(request, reply) {
  const body = aiInputSchema.parse(request.body || {});
  reply.send(await productAi.suggest(request.server, request.store, body));
}

/** GET /api/products/tags — every tag the store uses, most used first,
 * and whether AI writing help is on. */
async function tagsHandler(request, reply) {
  reply.send({ tags: await productAi.storeTags(request.server.prisma, request.store.id), aiAvailable: ai.aiConfigured() });
}

module.exports = { listHandler, getHandler, createHandler, updateHandler, deleteHandler, bulkHandler, aiDescriptionHandler, aiSuggestHandler, tagsHandler };
