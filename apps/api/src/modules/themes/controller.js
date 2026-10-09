const { oyklaneAddress } = require("../../lib/storefront-url");
const {
  installThemeSchema,
  updateThemeSettingsSchema,
  upsertThemeFileSchema,
  renameThemeFileSchema,
  renderDraftSchema,
  createTemplateSchema,
  assignTemplateSchema,
} = require("@shopcycle/validation");
const templates = require("./templates");
const service = require("./service");
const storefrontService = require("../storefront/service");
const platform = require("../storefront/platform");
const appsService = require("../apps/service");

async function listHandler(request, reply) {
  const themes = await service.listThemes(request.server.prisma, request.store.id);
  reply.send({ themes, available: service.MASTER_THEMES });
}

async function getHandler(request, reply) {
  const theme = await service.getTheme(request.server.prisma, request.store.id, request.params.id);
  // The platform's arrangeable pages (product page): their sections and
  // default layouts, for the editor's page switcher.
  const installed = await appsService.getInstalledAppsContext(request.server.prisma, request.store.id);
  reply.send({
    theme,
    platform: await platform.editorPackage({ installed }),
    templates: templates.listFromFiles(theme.files, installed),
    templateUsage: await templates.usage(request.server.prisma, request.store.id),
  });
}

/** The active theme's extra templates, for the "Theme template" choice on
 * products, pages and collections. */
async function templatesHandler(request, reply) {
  const installed = await appsService.getInstalledAppsContext(request.server.prisma, request.store.id);
  reply.send(await templates.forActiveTheme(request.server.prisma, request.store.id, installed));
}

async function createTemplateHandler(request, reply) {
  const body = createTemplateSchema.parse(request.body);
  const installed = await appsService.getInstalledAppsContext(request.server.prisma, request.store.id);
  const template = await templates.create(request.server.prisma, request.store.id, request.params.id, body, installed);
  // "Use it for": the chosen items switch to it right away.
  const assigned = body.assign?.length ? await templates.assign(request.server.prisma, request.store.id, { kind: body.kind, name: template.name, ids: body.assign }) : null;
  reply.code(201).send({ template, usage: assigned?.usage });
}

async function assignTemplateHandler(request, reply) {
  const body = assignTemplateSchema.parse(request.body);
  reply.send(await templates.assign(request.server.prisma, request.store.id, body));
}

async function deleteTemplateHandler(request, reply) {
  reply.send(await templates.remove(request.server.prisma, request.store.id, request.params.id, request.params.name));
}

async function installHandler(request, reply) {
  const { handle } = installThemeSchema.parse(request.body);
  const theme = await service.installTheme(request.server.prisma, request.store.id, handle);
  reply.code(201).send({ theme });
}

async function duplicateHandler(request, reply) {
  const theme = await service.duplicateTheme(request.server.prisma, request.store.id, request.params.id);
  reply.code(201).send({ theme });
}

async function deleteHandler(request, reply) {
  await service.deleteTheme(request.server.prisma, request.store.id, request.params.id);
  reply.send({ ok: true });
}

async function activateHandler(request, reply) {
  const theme = await service.activateTheme(request.server.prisma, request.store.id, request.params.id);
  reply.send({ theme });
}

async function updateSettingsHandler(request, reply) {
  const { settingsData } = updateThemeSettingsSchema.parse(request.body);
  const theme = await service.updateThemeSettings(request.server.prisma, request.store.id, request.params.id, settingsData);
  reply.send({ theme });
}

async function upsertFileHandler(request, reply) {
  const { path, content } = upsertThemeFileSchema.parse(request.body);
  const file = await service.upsertThemeFile(request.server.prisma, request.store.id, request.params.id, path, content);
  reply.send({ file });
}

async function createFileHandler(request, reply) {
  const { path, content } = upsertThemeFileSchema.parse(request.body);
  const file = await service.createThemeFile(request.server.prisma, request.store.id, request.params.id, path, content);
  reply.code(201).send({ file });
}

async function deleteFileHandler(request, reply) {
  await service.deleteThemeFile(request.server.prisma, request.store.id, request.params.id, request.params.fileId);
  reply.code(204).send();
}

async function renameFileHandler(request, reply) {
  const { newPath } = renameThemeFileSchema.parse(request.body);
  const file = await service.renameThemeFile(
    request.server.prisma,
    request.store.id,
    request.params.id,
    request.params.fileId,
    newPath
  );
  reply.send({ file });
}

async function listRevisionsHandler(request, reply) {
  const revisions = await service.listFileRevisions(
    request.server.prisma,
    request.store.id,
    request.params.id,
    request.params.fileId
  );
  reply.send({ revisions });
}

async function restoreRevisionHandler(request, reply) {
  const file = await service.restoreFileRevision(
    request.server.prisma,
    request.store.id,
    request.params.id,
    request.params.fileId,
    request.params.revisionId
  );
  reply.send({ file });
}

/** Backs the Phase 3 editor's live iframe: renders the theme with an
 * *unsaved* draft template/settings/files, never touching the database.
 * Also used by the Themes page's "Preview" button to render the theme's
 * currently-saved state without requiring it to be active. */
// A render runs ~10 queries at once. While a seller types, the editor
// asks for a fresh preview every few hundred ms; unbounded, a burst of
// those took every database connection (P2024 pool timeouts) and stalled
// the live storefront too. So: a few at a time per process, and a request
// the browser already gave up on (a newer edit replaced it) is skipped.
const MAX_DRAFT_RENDERS = 3;
let draftRendersRunning = 0;
const draftRenderQueue = [];

async function withDraftRenderSlot(request, fn) {
  if (draftRendersRunning >= MAX_DRAFT_RENDERS) {
    await new Promise((resolve) => draftRenderQueue.push(resolve));
  }
  draftRendersRunning++;
  try {
    // The connection, not the request: a request reads as "destroyed" as
    // soon as its body has been read.
    if (request.raw.socket?.destroyed) return null;
    return await fn();
  } finally {
    draftRendersRunning--;
    draftRenderQueue.shift()?.();
  }
}

/** A locked (Oyklane Store) theme previews its JSON edits only. */
async function allowedOverrides(request, files) {
  if (!files) return files;
  const theme = await request.server.prisma.theme.findFirst({ where: { id: request.params.id, storeId: request.store.id }, select: { locked: true } });
  if (!theme?.locked) return files;
  return Object.fromEntries(Object.entries(files).filter(([path]) => /\.json$/i.test(path)));
}

async function renderDraftHandler(request, reply) {
  const body = renderDraftSchema.parse(request.body);
  const filesOverride = await allowedOverrides(request, body.filesOverride);
  const result = await withDraftRenderSlot(request, () => storefrontService.renderPage(request.server.prisma, {
    handle: request.store.handle,
    themeId: request.params.id,
    templateName: body.template,
    slug: body.slug,
    templateOverride: body.templateOverride,
    settingsOverride: body.settingsOverride,
    filesOverride,
    // The preview is shown inside the admin (store.<root>), so its CSS, JS
    // and images load from the store's own address, like the live store —
    // never from the API's host.
    assetBaseOverride: oyklaneAddress(request.store) || undefined,
  }));
  if (!result) return reply.code(499).send({ error: "Cancelled" }); // the browser hung up
  reply.send({ html: result.html });
}

module.exports = {
  duplicateHandler,
  templatesHandler,
  createTemplateHandler,
  assignTemplateHandler,
  deleteTemplateHandler,
  deleteHandler,
  listHandler,
  getHandler,
  installHandler,
  activateHandler,
  updateSettingsHandler,
  upsertFileHandler,
  createFileHandler,
  deleteFileHandler,
  renameFileHandler,
  listRevisionsHandler,
  restoreRevisionHandler,
  renderDraftHandler,
};
