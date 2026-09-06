const { HttpError } = require("@shopcycle/utils");
const repository = require("./repository");

function listMenus(prisma, storeId) {
  return repository.list(prisma, storeId);
}

async function getMenu(prisma, storeId, id) {
  const menu = await repository.findById(prisma, storeId, id);
  if (!menu) throw new HttpError(404, "Menu not found");
  return menu;
}

async function createMenu(prisma, storeId, input) {
  const existing = await repository.findByHandle(prisma, storeId, input.handle);
  if (existing) throw new HttpError(409, `A menu with handle "${input.handle}" already exists`);
  return repository.create(prisma, storeId, input);
}

async function updateMenu(prisma, storeId, id, input) {
  await getMenu(prisma, storeId, id);
  return repository.update(prisma, id, input);
}

async function deleteMenu(prisma, storeId, id) {
  await getMenu(prisma, storeId, id);
  await repository.remove(prisma, id);
}

module.exports = { listMenus, getMenu, createMenu, updateMenu, deleteMenu };
