const { HttpError } = require("@shopcycle/utils");
const repository = require("./repository");

/** Every menu, with where the store's live theme shows it ("Header",
 * "Footer · Help") — read from the theme's header and footer settings. */
async function listMenus(prisma, storeId) {
  const [menus, theme] = await Promise.all([
    repository.list(prisma, storeId),
    prisma.theme.findFirst({ where: { storeId, isActive: true }, select: { settingsData: true } }),
  ]);
  const used = menuPlaces(theme?.settingsData);
  return menus.map((m) => ({ ...m, usedIn: used[m.handle] || [] }));
}

/** handle → places. A footer never edited shows its default columns:
 * "Shop" (main-menu) and "Help" (footer-menu), in every theme. */
function menuPlaces(settingsData) {
  const sections = (settingsData && settingsData.sections) || {};
  const places = {};
  const add = (handle, place) => {
    if (!handle) return;
    (places[handle] = places[handle] || []).push(place);
  };
  const header = sections.header || {};
  add(header.menu || header.settings?.menu || "main-menu", "Header");
  const footer = sections.footer || {};
  const order = Array.isArray(footer.block_order) ? footer.block_order : [];
  if (footer.blocks && order.length) {
    for (const id of order) {
      const block = footer.blocks[id];
      if (!block || block.disabled || block.type !== "links") continue;
      const heading = block.settings?.heading ?? block.heading;
      add(block.settings?.menu ?? block.menu ?? "footer-menu", heading ? `Footer · ${heading}` : "Footer");
    }
  } else {
    add("main-menu", "Footer · Shop");
    add("footer-menu", "Footer · Help");
  }
  return places;
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
