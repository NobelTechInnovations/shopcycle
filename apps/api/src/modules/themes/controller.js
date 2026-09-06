const {
  installThemeSchema,
  updateThemeSettingsSchema,
  upsertThemeFileSchema,
  renameThemeFileSchema,
  renderDraftSchema,
} = require("@shopcycle/validation");
const service = require("./service");
const storefrontService = require("../storefront/service");

async function listHandler(request, reply) {
  const themes = await service.listThemes(request.server.prisma, request.store.id);
  reply.send({ themes, available: service.MASTER_THEMES });
}

async function getHandler(request, reply) {
  const theme = await service.getTheme(request.server.prisma, request.store.id, request.params.id);
  reply.send({ theme });
}

async function installHandler(request, reply) {
  const { handle } = installThemeSchema.parse(request.body);
  const theme = await service.installTheme(request.server.prisma, request.store.id, handle);
  reply.code(201).send({ theme });
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
async function renderDraftHandler(request, reply) {
  const body = renderDraftSchema.parse(request.body);
  const { html } = await storefrontService.renderPage(request.server.prisma, request.server.redis, {
    handle: request.store.handle,
    themeId: request.params.id,
    templateName: body.template,
    slug: body.slug,
    templateOverride: body.templateOverride,
    settingsOverride: body.settingsOverride,
    filesOverride: body.filesOverride,
  });
  reply.send({ html });
}

module.exports = {
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
