const { HttpError, slugify } = require("@shopcycle/utils");
const repository = require("./repository");

async function uniqueSlug(prisma, storeId, title, excludeId) {
  const base = slugify(title) || "page";
  let slug = base;
  let suffix = 1;
  while (await repository.findBySlug(prisma, storeId, slug, excludeId)) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

async function listPages(prisma, storeId, query) {
  const [pages, total] = await repository.list(prisma, storeId, query);
  return { pages, total, page: query.page, pageSize: query.pageSize };
}

async function getPage(prisma, storeId, id) {
  const page = await repository.findById(prisma, storeId, id);
  if (!page) throw new HttpError(404, "Page not found");
  return page;
}

async function createPage(prisma, storeId, input) {
  const slug = await uniqueSlug(prisma, storeId, input.title);
  return repository.create(prisma, storeId, input, slug);
}

async function updatePage(prisma, storeId, id, input) {
  await getPage(prisma, storeId, id);
  const slug = input.title ? await uniqueSlug(prisma, storeId, input.title, id) : undefined;
  return repository.update(prisma, id, input, slug);
}

async function deletePage(prisma, storeId, id) {
  await getPage(prisma, storeId, id);
  await repository.remove(prisma, id);
}

module.exports = { listPages, getPage, createPage, updatePage, deletePage };
