const crypto = require("crypto");
const { HttpError } = require("@shopcycle/utils");
const { extractSchema, buildDefaultSettings, findBlockSchema } = require("@shopcycle/theme-schema");
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

/** One menu with where the live theme shows it. */
async function getMenuWithPlaces(prisma, storeId, id) {
  const [menu, theme] = await Promise.all([getMenu(prisma, storeId, id), liveTheme(prisma, storeId)]);
  return { ...menu, usedIn: menuPlaces(theme?.settingsData)[menu.handle] || [] };
}

const liveTheme = (prisma, storeId) => prisma.theme.findFirst({ where: { storeId, isActive: true }, select: { id: true, settingsData: true } });

/** The footer's blocks as real entries — a footer never edited shows its
 * schema's default columns, so those become real blocks first (otherwise
 * adding one column would hide all the defaults). */
async function footerEntry(prisma, theme) {
  const footer = { ...((theme.settingsData?.sections || {}).footer || {}) };
  const file = await prisma.themeFile.findUnique({ where: { themeId_path: { themeId: theme.id, path: "sections/footer.liquid" } }, select: { content: true } });
  const schema = file ? extractSchema(file.content) : null;
  if (!footer.blocks || !(footer.block_order || []).length) {
    footer.blocks = {};
    footer.block_order = [];
    for (const b of schema?.default_blocks || []) {
      const id = crypto.randomBytes(4).toString("hex");
      footer.blocks[id] = { type: b.type, settings: { ...buildDefaultSettings(findBlockSchema(schema, b.type)), ...(b.settings || {}) } };
      footer.block_order.push(id);
    }
  } else {
    footer.blocks = { ...footer.blocks };
    footer.block_order = [...footer.block_order];
  }
  return { footer, schema };
}

const blockMenu = (b) => b?.settings?.menu ?? b?.menu;

/**
 * Shows a menu on the live theme: "header" makes it the main navigation,
 * "footer" adds it as a new footer column (after the other link columns).
 * `remove: true` takes it off again.
 */
async function placeMenu(prisma, storeId, id, { where, remove = false }) {
  const menu = await getMenu(prisma, storeId, id);
  const theme = await liveTheme(prisma, storeId);
  if (!theme) throw new HttpError(400, "Publish a theme first — Online Store ▸ Themes");
  const data = theme.settingsData || {};
  const sections = { ...(data.sections || {}) };

  if (where === "header") {
    const header = { ...(sections.header || {}) };
    if (remove) {
      if ((header.menu ?? header.settings?.menu ?? "main-menu") !== menu.handle) return getMenuWithPlaces(prisma, storeId, id);
      header.menu = "main-menu";
    } else header.menu = menu.handle;
    sections.header = header;
  } else if (where === "footer") {
    const { footer, schema } = await footerEntry(prisma, theme);
    const mine = footer.block_order.filter((bid) => footer.blocks[bid]?.type === "links" && blockMenu(footer.blocks[bid]) === menu.handle);
    if (remove) {
      for (const bid of mine) delete footer.blocks[bid];
      footer.block_order = footer.block_order.filter((bid) => !mine.includes(bid));
    } else {
      if (mine.some((bid) => !footer.blocks[bid].disabled)) throw new HttpError(409, "This menu is already a footer column");
      if (!(schema?.blocks || []).some((b) => b.type === "links")) throw new HttpError(400, "Your theme's footer has no link columns");
      const max = schema?.max_blocks || 8;
      if (footer.block_order.length >= max) throw new HttpError(400, `Your footer is full (${max} blocks). Remove one in Online Store ▸ Customize ▸ Footer first.`);
      const bid = crypto.randomBytes(4).toString("hex");
      footer.blocks[bid] = { type: "links", settings: { heading: menu.title, menu: menu.handle } };
      let at = -1;
      footer.block_order.forEach((x, i) => {
        if (footer.blocks[x]?.type === "links") at = i;
      });
      footer.block_order.splice(at + 1, 0, bid);
    }
    sections.footer = footer;
  } else {
    throw new HttpError(400, "Choose header or footer");
  }

  await prisma.theme.update({ where: { id: theme.id }, data: { settingsData: { ...data, sections } } });
  return getMenuWithPlaces(prisma, storeId, id);
}

async function createMenu(prisma, storeId, { showIn, ...input }) {
  const existing = await repository.findByHandle(prisma, storeId, input.handle);
  if (existing) throw new HttpError(409, `A menu with handle "${input.handle}" already exists`);
  const menu = await repository.create(prisma, storeId, input);
  if (showIn === "header" || showIn === "footer") return placeMenu(prisma, storeId, menu.id, { where: showIn });
  return menu;
}

async function updateMenu(prisma, storeId, id, input) {
  await getMenu(prisma, storeId, id);
  return repository.update(prisma, id, input);
}

async function deleteMenu(prisma, storeId, id) {
  const menu = await getMenu(prisma, storeId, id);
  // Its footer columns go too (the header falls back to main-menu).
  const theme = await liveTheme(prisma, storeId);
  if (theme && (menuPlaces(theme.settingsData)[menu.handle] || []).some((p) => p.startsWith("Footer"))) {
    await placeMenu(prisma, storeId, id, { where: "footer", remove: true }).catch(() => {});
  }
  await repository.remove(prisma, id);
}

module.exports = { listMenus, getMenu, getMenuWithPlaces, placeMenu, createMenu, updateMenu, deleteMenu };
