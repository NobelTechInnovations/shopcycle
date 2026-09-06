const fs = require("fs/promises");
const path = require("path");
const { HttpError } = require("@shopcycle/utils");
const { validateThemeFileContent } = require("@shopcycle/theme-engine");
const { THEMES_ROOT } = require("../../config/paths");
const { loadThemePackage } = require("./file-loader");

const MASTER_THEMES = {
  classic: { name: "Classic", description: "General ecommerce / fashion / grocery / lifestyle." },
  modern: { name: "Modern", description: "Premium D2C / modern brands." },
};

const EXT_TO_TYPE = { liquid: "liquid", json: "json", css: "css", js: "js" };
const REVISION_THROTTLE_MS = 30_000;

function listThemes(prisma, storeId) {
  return prisma.theme.findMany({
    where: { storeId },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
}

async function getTheme(prisma, storeId, id) {
  const theme = await prisma.theme.findFirst({
    where: { id, storeId },
    include: { files: { orderBy: { path: "asc" } } },
  });
  if (!theme) throw new HttpError(404, "Theme not found");
  return theme;
}

async function assertThemeOwnership(prisma, storeId, themeId) {
  const theme = await prisma.theme.findFirst({ where: { id: themeId, storeId } });
  if (!theme) throw new HttpError(404, "Theme not found");
  return theme;
}

async function assertFileOwnership(prisma, themeId, fileId) {
  const file = await prisma.themeFile.findFirst({ where: { id: fileId, themeId } });
  if (!file) throw new HttpError(404, "File not found");
  return file;
}

/** Copies a master theme package (/themes/<handle>) into a new Theme +
 * ThemeFile rows for this store. The master package is never touched —
 * every store gets its own editable copy, which is what lets a merchant
 * customize Classic without changing what "Classic" looks like for anyone
 * who installs it after them. */
async function installTheme(prisma, storeId, handle) {
  const master = MASTER_THEMES[handle];
  if (!master) throw new HttpError(400, `Unknown theme handle: ${handle}`);

  const themeDir = path.join(THEMES_ROOT, handle);
  try {
    await fs.access(themeDir);
  } catch {
    throw new HttpError(500, `Master theme package missing on disk: ${themeDir}`);
  }

  const [files, settingsSchemaRaw, existingThemeCount] = await Promise.all([
    loadThemePackage(themeDir),
    fs.readFile(path.join(themeDir, "config/settings_data.json"), "utf8"),
    prisma.theme.count({ where: { storeId } }),
  ]);

  const settingsData = JSON.parse(settingsSchemaRaw);

  return prisma.theme.create({
    data: {
      storeId,
      name: master.name,
      handle,
      description: master.description,
      status: "installed",
      isActive: existingThemeCount === 0, // first theme a store installs goes live automatically
      settingsData,
      files: { create: files },
    },
    include: { files: false },
  });
}

/** Exactly one theme may be active per store — flip both in one transaction
 * so there's never a moment (or a failed second write) where a store has
 * zero or two active themes. */
async function activateTheme(prisma, storeId, id) {
  await assertThemeOwnership(prisma, storeId, id);

  return prisma.$transaction(async (tx) => {
    await tx.theme.updateMany({ where: { storeId, isActive: true }, data: { isActive: false } });
    return tx.theme.update({ where: { id }, data: { isActive: true } });
  });
}

async function updateThemeSettings(prisma, storeId, id, settingsData) {
  const theme = await assertThemeOwnership(prisma, storeId, id);

  return prisma.theme.update({
    where: { id },
    data: { settingsData: { ...theme.settingsData, ...settingsData } },
  });
}

/** Snapshots the file's pre-change content into theme_file_revisions,
 * throttled to at most one snapshot per REVISION_THROTTLE_MS — without
 * this, the visual editor's ~1.2s autosave tick would create a revision
 * on nearly every keystroke-adjacent save. Rollback granularity of
 * "every 30s while actively editing" is the tradeoff; an explicit Save in
 * the code editor still always gets its own revision since edits there are
 * spaced out by normal typing/thinking time. */
async function maybeSnapshotRevision(prisma, file) {
  const lastRevision = await prisma.themeFileRevision.findFirst({
    where: { themeFileId: file.id },
    orderBy: { createdAt: "desc" },
  });
  const stale = !lastRevision || Date.now() - lastRevision.createdAt.getTime() > REVISION_THROTTLE_MS;
  if (stale) {
    await prisma.themeFileRevision.create({
      data: { themeFileId: file.id, path: file.path, content: file.content },
    });
  }
}

/** Upserts one theme file by path — the persistence mechanism for both the
 * visual editor's autosave (`templates/index.json`) and the code editor's
 * saves to any file. Validates content first so a malformed save can't
 * break rendering for every visitor. */
async function upsertThemeFile(prisma, storeId, themeId, filePath, content) {
  await assertThemeOwnership(prisma, storeId, themeId);

  const validation = validateThemeFileContent(filePath, content);
  if (!validation.valid) throw new HttpError(400, validation.error);

  const ext = filePath.split(".").pop();
  const fileType = EXT_TO_TYPE[ext] || "text";

  const existing = await prisma.themeFile.findUnique({ where: { themeId_path: { themeId, path: filePath } } });
  if (existing && existing.content !== content) {
    await maybeSnapshotRevision(prisma, existing);
  }

  return prisma.themeFile.upsert({
    where: { themeId_path: { themeId, path: filePath } },
    update: { content, fileType },
    create: { themeId, path: filePath, content, fileType },
  });
}

/** Creates a brand-new file — distinct from upsert so the code editor's
 * "New file" action can 409 on a path collision instead of silently
 * overwriting something. */
async function createThemeFile(prisma, storeId, themeId, filePath, content) {
  await assertThemeOwnership(prisma, storeId, themeId);

  const existing = await prisma.themeFile.findUnique({ where: { themeId_path: { themeId, path: filePath } } });
  if (existing) throw new HttpError(409, `A file already exists at ${filePath}`);

  const validation = validateThemeFileContent(filePath, content);
  if (!validation.valid) throw new HttpError(400, validation.error);

  const ext = filePath.split(".").pop();
  const fileType = EXT_TO_TYPE[ext] || "text";

  return prisma.themeFile.create({ data: { themeId, path: filePath, content, fileType } });
}

async function deleteThemeFile(prisma, storeId, themeId, fileId) {
  await assertThemeOwnership(prisma, storeId, themeId);
  await assertFileOwnership(prisma, themeId, fileId);
  await prisma.themeFile.delete({ where: { id: fileId } });
}

async function renameThemeFile(prisma, storeId, themeId, fileId, newPath) {
  await assertThemeOwnership(prisma, storeId, themeId);
  await assertFileOwnership(prisma, themeId, fileId);

  const collision = await prisma.themeFile.findUnique({ where: { themeId_path: { themeId, path: newPath } } });
  if (collision && collision.id !== fileId) throw new HttpError(409, `A file already exists at ${newPath}`);

  const ext = newPath.split(".").pop();
  const fileType = EXT_TO_TYPE[ext] || "text";

  return prisma.themeFile.update({ where: { id: fileId }, data: { path: newPath, fileType } });
}

async function listFileRevisions(prisma, storeId, themeId, fileId) {
  await assertThemeOwnership(prisma, storeId, themeId);
  await assertFileOwnership(prisma, themeId, fileId);
  return prisma.themeFileRevision.findMany({ where: { themeFileId: fileId }, orderBy: { createdAt: "desc" } });
}

async function restoreFileRevision(prisma, storeId, themeId, fileId, revisionId) {
  await assertThemeOwnership(prisma, storeId, themeId);
  const file = await assertFileOwnership(prisma, themeId, fileId);
  const revision = await prisma.themeFileRevision.findFirst({ where: { id: revisionId, themeFileId: fileId } });
  if (!revision) throw new HttpError(404, "Revision not found");

  // The state you're rolling back *from* is itself worth keeping.
  await prisma.themeFileRevision.create({
    data: { themeFileId: fileId, path: file.path, content: file.content },
  });

  return prisma.themeFile.update({ where: { id: fileId }, data: { content: revision.content } });
}

module.exports = {
  MASTER_THEMES,
  listThemes,
  getTheme,
  installTheme,
  activateTheme,
  updateThemeSettings,
  upsertThemeFile,
  createThemeFile,
  deleteThemeFile,
  renameThemeFile,
  listFileRevisions,
  restoreFileRevision,
};
