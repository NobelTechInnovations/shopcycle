const { HttpError } = require("@shopcycle/utils");
const platform = require("../storefront/platform");
const { TEMPLATE_SUFFIX } = require("@shopcycle/validation");

/**
 * Extra templates — Shopify's "alternate templates". Besides its default
 * layout, a product, content page or collection can use one of the
 * store's named templates (templates/product.rental.json in the theme),
 * picked on the item's own page in the admin. Each is arranged in the
 * theme editor like the default: the platform's main section plus any of
 * the theme's sections. Installed apps can bring their own (Rentals:
 * "Rental product").
 */

const KINDS = ["product", "page", "collection"];
const KIND_LABEL = { product: "product", page: "page", collection: "collection" };
const PATH = /^templates\/(product|page|collection)\.([a-z0-9][a-z0-9-]{0,29})\.json$/;

/** "size-guide" → "Size guide". */
function labelFor(suffix) {
  const words = String(suffix).replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Size guide!" → "size-guide". */
function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
}

/** The extra templates a theme's files hold, plus those installed apps add. */
function listFromFiles(files, installed = {}) {
  const out = { product: [], page: [], collection: [] };
  const seen = new Set();
  for (const f of files) {
    const m = String(f.path).match(PATH);
    if (!m) continue;
    seen.add(`${m[1]}.${m[2]}`);
    out[m[1]].push({ suffix: m[2], name: `${m[1]}.${m[2]}`, label: labelFor(m[2]), source: "theme" });
  }
  for (const t of platform.appTemplates(installed)) {
    const name = `${t.kind}.${t.suffix}`;
    const own = out[t.kind].find((x) => x.name === name);
    if (own) own.label = t.label; // the seller's edited copy of the app's template
    else if (!seen.has(name)) out[t.kind].push({ suffix: t.suffix, name, label: t.label, source: "app" });
  }
  for (const kind of KINDS) out[kind].sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

/** The active theme's extra templates — what the product/page/collection forms offer. */
async function forActiveTheme(prisma, storeId, installed) {
  const theme = await prisma.theme.findFirst({
    where: { storeId, isActive: true },
    select: { id: true, name: true, files: { where: { path: { startsWith: "templates/" } }, select: { path: true } } },
  });
  return { themeId: theme?.id || null, themeName: theme?.name || null, ...listFromFiles(theme?.files || [], installed) };
}

/** The layout a new template starts from: another template of the same
 * kind, or the default one (the store's arrangement, else the platform's). */
async function startingLayout(prisma, themeId, kind, basedOn, installed) {
  const { renderFiles } = await platform.load();
  const fromFile = async (path) => (await prisma.themeFile.findUnique({ where: { themeId_path: { themeId, path } } }))?.content;
  const candidates = [];
  if (basedOn) {
    candidates.push(await fromFile(`templates/${kind}.${basedOn}.json`));
    if (platform.appTemplates(installed).some((t) => t.kind === kind && t.suffix === basedOn)) candidates.push(renderFiles[`templates/${kind}.${basedOn}.json`]);
  }
  candidates.push(await fromFile(`templates/${kind}.json`), renderFiles[`templates/${kind}.json`]);
  for (const raw of candidates) {
    const arranged = platform.sanitizeArrangement(kind, raw);
    if (arranged) return arranged;
  }
  throw new HttpError(500, "The default layout couldn't be read");
}

async function create(prisma, storeId, themeId, { kind, name, basedOn }, installed) {
  const theme = await prisma.theme.findFirst({ where: { id: themeId, storeId }, select: { id: true } });
  if (!theme) throw new HttpError(404, "Theme not found");
  const suffix = slugify(name);
  if (!suffix || !TEMPLATE_SUFFIX.test(suffix)) throw new HttpError(400, "Give the template a name with letters or numbers.");
  if (suffix === "default") throw new HttpError(400, "“Default” is the standard template — choose another name.");
  const path = `templates/${kind}.${suffix}.json`;
  const exists = await prisma.themeFile.findUnique({ where: { themeId_path: { themeId, path } } });
  if (exists) throw new HttpError(409, `There's already a ${KIND_LABEL[kind]} template called “${labelFor(suffix)}”.`);
  const content = await startingLayout(prisma, themeId, kind, basedOn ? slugify(basedOn) : null, installed);
  await prisma.themeFile.create({ data: { themeId, path, content, fileType: "json" } });
  return { kind, suffix, name: `${kind}.${suffix}`, label: labelFor(suffix), content: JSON.parse(content) };
}

/** Deletes a template. Items that used it go back to the default — told
 * to the seller first (`using`). */
async function remove(prisma, storeId, themeId, name) {
  const { base, suffix } = platform.templateParts(name);
  if (!KINDS.includes(base) || !suffix) throw new HttpError(400, "That isn't an extra template.");
  const theme = await prisma.theme.findFirst({ where: { id: themeId, storeId }, select: { id: true, isActive: true } });
  if (!theme) throw new HttpError(404, "Theme not found");
  await prisma.themeFile.deleteMany({ where: { themeId, path: `templates/${base}.${suffix}.json` } });
  return { removed: name };
}

const MODEL = { product: "product", page: "page", collection: "collection" };

/** Makes exactly `ids` use the template `name` ("page.about-us"); items of
 * that kind that used it and aren't in `ids` go back to the default. For a
 * default template ("page"), `ids` simply move onto it. */
async function assign(prisma, storeId, { kind, name, ids }) {
  const { base, suffix } = platform.templateParts(name);
  if (base !== kind) throw new HttpError(400, "That template is for another kind of page.");
  const model = prisma[MODEL[kind]];
  const unique = [...new Set(ids)];
  await prisma.$transaction([
    ...(suffix ? [model.updateMany({ where: { storeId, templateSuffix: suffix, id: { notIn: unique } }, data: { templateSuffix: null } })] : []),
    model.updateMany({ where: { storeId, id: { in: unique } }, data: { templateSuffix: suffix || null } }),
  ]);
  return { usage: await usage(prisma, storeId) };
}

/** How many products/pages/collections use each template — shown before
 * deleting one. */
async function usage(prisma, storeId) {
  const [products, pages, collections] = await Promise.all([
    prisma.product.groupBy({ by: ["templateSuffix"], where: { storeId, templateSuffix: { not: null } }, _count: true }),
    prisma.page.groupBy({ by: ["templateSuffix"], where: { storeId, templateSuffix: { not: null } }, _count: true }),
    prisma.collection.groupBy({ by: ["templateSuffix"], where: { storeId, templateSuffix: { not: null } }, _count: true }),
  ]);
  const out = {};
  for (const [kind, rows] of [["product", products], ["page", pages], ["collection", collections]]) {
    for (const r of rows) out[`${kind}.${r.templateSuffix}`] = r._count;
  }
  return out;
}

module.exports = { KINDS, labelFor, slugify, listFromFiles, forActiveTheme, create, remove, usage, assign };
