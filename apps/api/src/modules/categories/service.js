const { HttpError, slugify } = require("@shopcycle/utils");
const repository = require("./repository");

async function uniqueSlug(prisma, storeId, title, excludeId) {
  const base = slugify(title) || "category";
  let slug = base;
  let suffix = 1;
  while (await repository.findBySlug(prisma, storeId, slug, excludeId)) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

async function listCategories(prisma, storeId, query) {
  const [categories, total] = await repository.list(prisma, storeId, query);
  return { categories, total, page: query.page, pageSize: query.pageSize };
}

async function getCategory(prisma, storeId, id) {
  const category = await repository.findById(prisma, storeId, id);
  if (!category) throw new HttpError(404, "Category not found");
  return category;
}

async function createCategory(prisma, storeId, input) {
  const slug = await uniqueSlug(prisma, storeId, input.title);
  return repository.create(prisma, storeId, input, slug);
}

async function updateCategory(prisma, storeId, id, input) {
  await getCategory(prisma, storeId, id);
  const slug = input.title ? await uniqueSlug(prisma, storeId, input.title, id) : undefined;
  return repository.update(prisma, id, input, slug);
}

async function deleteCategory(prisma, storeId, id) {
  await getCategory(prisma, storeId, id);
  await repository.remove(prisma, id);
}

module.exports = { listCategories, getCategory, createCategory, updateCategory, deleteCategory };
