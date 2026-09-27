const { HttpError, slugify } = require("@shopcycle/utils");
const { assertWithinPlanLimit } = require("../../lib/plan-limits");
const repository = require("./repository");
const metafieldService = require("../metafields/service");

async function uniqueSlug(prisma, storeId, title, excludeId) {
  const base = slugify(title) || "product";
  let slug = base;
  let suffix = 1;
  while (await repository.findBySlug(prisma, storeId, slug, excludeId)) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

async function listProducts(prisma, storeId, query) {
  const [products, total] = await repository.list(prisma, storeId, query);
  return { products, total, page: query.page, pageSize: query.pageSize };
}

async function getProduct(prisma, storeId, id) {
  const product = await repository.findById(prisma, storeId, id);
  if (!product) throw new HttpError(404, "Product not found");
  return product;
}

async function createProduct(prisma, store, input, { actorName } = {}) {
  const productCount = await repository.count(prisma, store.id);
  assertWithinPlanLimit(store.plan, productCount, "productLimit", "products");
  const slug = await uniqueSlug(prisma, store.id, input.title);
  const metafields = await metafieldService.applyValues(prisma, store.id, "product", input.metafields);
  return repository.create(prisma, store.id, { ...input, metafields }, slug, { actorName });
}

async function updateProduct(prisma, storeId, id, input, { actorName } = {}) {
  const current = await getProduct(prisma, storeId, id); // 404s if not found or not owned by this store
  const slug = input.title ? await uniqueSlug(prisma, storeId, input.title, id) : undefined;
  const metafields = await metafieldService.applyValues(prisma, storeId, "product", input.metafields, current.metafields);
  return repository.update(prisma, id, { ...input, metafields }, slug, { storeId, actorName });
}

async function deleteProduct(prisma, storeId, id) {
  await getProduct(prisma, storeId, id);
  await repository.remove(prisma, id);
}

/** Bulk actions from the product list: set a status on, or delete, many
 * products at once. Only this store's products are touched — ids from
 * another store are simply not matched. */
async function bulkProducts(prisma, storeId, { ids, action }) {
  const owned = await prisma.product.findMany({ where: { storeId, id: { in: ids } }, select: { id: true } });
  const ownedIds = owned.map((p) => p.id);
  if (!ownedIds.length) return { count: 0 };
  if (action === "delete") {
    for (const id of ownedIds) await repository.remove(prisma, id);
    return { count: ownedIds.length };
  }
  const status = { activate: "active", draft: "draft", archive: "archived" }[action];
  if (!status) throw new HttpError(400, "Unknown action");
  const { count } = await prisma.product.updateMany({ where: { storeId, id: { in: ownedIds } }, data: { status } });
  return { count };
}

module.exports = { listProducts, getProduct, createProduct, updateProduct, deleteProduct, bulkProducts, uniqueSlug };
