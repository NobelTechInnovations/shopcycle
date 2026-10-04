const { HttpError, slugify } = require("@shopcycle/utils");
const repository = require("./repository");
const metafieldService = require("../metafields/service");

async function uniqueSlug(prisma, storeId, title, excludeId) {
  const base = slugify(title) || "collection";
  let slug = base;
  let suffix = 1;
  while (await repository.findBySlug(prisma, storeId, slug, excludeId)) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

async function listCollections(prisma, storeId, query) {
  const [collections, total] = await repository.list(prisma, storeId, query);
  return { collections, total, page: query.page, pageSize: query.pageSize };
}

async function getCollection(prisma, storeId, id) {
  const collection = await repository.findById(prisma, storeId, id);
  if (!collection) throw new HttpError(404, "Collection not found");
  return collection;
}

async function createCollection(prisma, storeId, input) {
  const slug = await uniqueSlug(prisma, storeId, input.title);
  const metafields = await metafieldService.applyValues(prisma, storeId, "collection", input.metafields);
  return repository.create(prisma, storeId, { ...input, metafields }, slug);
}

async function updateCollection(prisma, storeId, id, input) {
  const current = await getCollection(prisma, storeId, id);
  const slug = input.title ? await uniqueSlug(prisma, storeId, input.title, id) : undefined;
  const metafields = await metafieldService.applyValues(prisma, storeId, "collection", input.metafields, current.metafields);
  return repository.update(prisma, id, { ...input, metafields }, slug);
}

async function deleteCollection(prisma, storeId, id) {
  await getCollection(prisma, storeId, id);
  await repository.remove(prisma, id);
}

module.exports = { listCollections, getCollection, createCollection, updateCollection, deleteCollection };
