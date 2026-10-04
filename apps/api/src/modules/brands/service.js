const { HttpError, slugify } = require("@shopcycle/utils");
const repository = require("./repository");

async function uniqueSlug(prisma, storeId, title, excludeId) {
  const base = slugify(title) || "brand";
  let slug = base;
  let suffix = 1;
  while (await repository.findBySlug(prisma, storeId, slug, excludeId)) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

async function listBrands(prisma, storeId, query) {
  const [brands, total] = await repository.list(prisma, storeId, query);
  return { brands, total, page: query.page, pageSize: query.pageSize };
}

async function getBrand(prisma, storeId, id) {
  const brand = await repository.findById(prisma, storeId, id);
  if (!brand) throw new HttpError(404, "Brand not found");
  return brand;
}

async function createBrand(prisma, storeId, input) {
  const slug = await uniqueSlug(prisma, storeId, input.title);
  return repository.create(prisma, storeId, input, slug);
}

async function updateBrand(prisma, storeId, id, input) {
  await getBrand(prisma, storeId, id);
  const slug = input.title ? await uniqueSlug(prisma, storeId, input.title, id) : undefined;
  return repository.update(prisma, id, input, slug);
}

async function deleteBrand(prisma, storeId, id) {
  await getBrand(prisma, storeId, id);
  await repository.remove(prisma, id);
}

module.exports = { listBrands, getBrand, createBrand, updateBrand, deleteBrand };
