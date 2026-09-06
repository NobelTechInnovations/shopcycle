const { HttpError, slugify } = require("@shopcycle/utils");
const { assertWithinPlanLimit } = require("../../lib/plan-limits");
const repository = require("./repository");

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

async function createProduct(prisma, store, input) {
  const productCount = await repository.count(prisma, store.id);
  assertWithinPlanLimit(store.plan, productCount, "productLimit", "products");
  const slug = await uniqueSlug(prisma, store.id, input.title);
  return repository.create(prisma, store.id, input, slug);
}

async function updateProduct(prisma, storeId, id, input) {
  await getProduct(prisma, storeId, id); // 404s if not found or not owned by this store
  const slug = input.title ? await uniqueSlug(prisma, storeId, input.title, id) : undefined;
  return repository.update(prisma, id, input, slug);
}

async function deleteProduct(prisma, storeId, id) {
  await getProduct(prisma, storeId, id);
  await repository.remove(prisma, id);
}

module.exports = { listProducts, getProduct, createProduct, updateProduct, deleteProduct };
