const fs = require("fs/promises");
const path = require("path");
const { HttpError } = require("@shopcycle/utils");
const { validateThemeFileContent } = require("@shopcycle/theme-engine");
const { THEMES_ROOT } = require("../../config/paths");
const { loadThemePackage } = require("./file-loader");
const pristine = require("./pristine");

/** The built-in themes. `version` goes up with each release; a store's
 * copy keeps the version it was installed at, so the Themes page can offer
 * "a newer version is available" — added as a separate theme, never
 * overwriting the merchant's customised live one. */
const MASTER_THEMES = {
  classic: {
    name: "Classic",
    version: "2.1.2",
    description: "Clean and versatile — slideshow, collections, product rows, offers, reviews and a journal. Suits fashion, home, beauty and gifting.",
    bestFor: "Any shop",
    swatch: { bg: "#FFFFFF", surface: "#F6F3EE", text: "#1A1A1A", accent: "#D2452F", font: "Fraunces" },
  },
  modern: {
    name: "Modern",
    version: "2.0.2",
    description: "Bold and editorial for D2C brands — full-bleed hero, scrolling text, bento categories, promo tiles, reviews and FAQ.",
    bestFor: "D2C brands",
    swatch: { bg: "#F3F3EF", surface: "#FFFFFF", text: "#0E0E0E", accent: "#D7F75B", font: "Plus Jakarta Sans" },
  },
  atelier: {
    name: "Atelier",
    version: "1.0.0",
    description: "Made for clothing — a split Women / Men hero, category circles, shop-the-look with product dots, tall product photos and a size-and-fit features row.",
    bestFor: "Clothing & fashion",
    swatch: { bg: "#FFFFFF", surface: "#F4F4F2", text: "#121212", accent: "#C8102E", font: "Archivo" },
  },
  fresh: {
    name: "Fresh",
    version: "1.0.0",
    description: "Made for groceries, food and drinks — category circles, deals of the day, offer tiles, product tiles with pack size, a veg / non-veg mark and a one-tap ADD button.",
    bestFor: "Grocery, food & drinks",
    swatch: { bg: "#FFFFFF", surface: "#F2F7EE", text: "#17251B", accent: "#1F7A3A", font: "Outfit" },
  },
  lumiere: {
    name: "Lumière",
    version: "1.0.0",
    description: "Quiet luxury for jewellery — serif type, emerald and gold, category arches, a craft story with facts, a gift guide and a trust row (hallmarked, certified, insured).",
    bestFor: "Jewellery & luxury",
    swatch: { bg: "#F5F3EF", surface: "#FFFFFF", text: "#123B30", accent: "#B8935A", font: "Cormorant Garamond" },
  },
};

/** "2.0.0" > "1.0.0" */
function isNewer(a, b) {
  const pa = String(a || "0").split(".").map(Number);
  const pb = String(b || "0").split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

const EXT_TO_TYPE = { liquid: "liquid", json: "json", css: "css", js: "js" };
const REVISION_THROTTLE_MS = 30_000;

async function listThemes(prisma, storeId) {
  const themes = await prisma.theme.findMany({
    // Oyklane Store previews on the demo store aren't the seller's themes.
    where: { storeId, NOT: { listingId: { not: null }, status: "draft" } },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
  return themes.map((t) => {
    const master = MASTER_THEMES[t.handle];
    return { ...t, latestVersion: master?.version || null, updateAvailable: Boolean(master && isNewer(master.version, t.version)) };
  });
}

async function getTheme(prisma, storeId, id) {
  const theme = await prisma.theme.findFirst({
    where: { id, storeId },
    include: { files: { orderBy: { path: "asc" } } },
  });
  if (!theme) throw new HttpError(404, "Theme not found");
  if (theme.locked) return { ...theme, files: theme.files.map(protectedFile) };
  // Untouched files the platform has improved since: the editors work on
  // the current version (see pristine.js).
  return pristine.withUpgrades(theme);
}

/** A locked theme's file as the admin sees it: JSON in full (layouts and
 * settings are the seller's), a section's settings schema (for the
 * visual editor) and nothing else of its code. */
function protectedFile(f) {
  if (/\.json$/i.test(f.path)) return f;
  if (f.fileType === "liquid") {
    const m = f.content.match(/\{%-?\s*schema\s*-?%\}[\s\S]*?\{%-?\s*endschema\s*-?%\}/);
    return { ...f, content: m ? m[0] : "", protected: true };
  }
  return { ...f, content: "", protected: true };
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
  const name =
    existingThemeCount > 0 && (await prisma.theme.count({ where: { storeId, handle } })) > 0
      ? `${master.name} ${master.version.split(".").slice(0, 2).join(".")}`
      : master.name;

  // The files go in as one bulk insert — a nested create is one INSERT per
  // file, which over a distant database is what made store sign-up slow.
  const write = async (db) => {
    const theme = await db.theme.create({
      data: {
        storeId,
        name,
        handle,
        version: master.version,
        description: master.description,
        status: "installed",
        isActive: existingThemeCount === 0, // first theme a store installs goes live automatically
        settingsData,
      },
    });
    await db.themeFile.createMany({ data: files.map((f) => ({ ...f, themeId: theme.id })) });
    return theme;
  };
  // Inside the caller's transaction (store sign-up) or in one of our own.
  return typeof prisma.$transaction === "function" ? prisma.$transaction(write, { timeout: 30000 }) : write(prisma);
}

/** Exactly one theme may be active per store — flip both in one transaction
 * so there's never a moment (or a failed second write) where a store has
 * zero or two active themes. */
async function activateTheme(prisma, storeId, id) {
  const theme = await assertThemeOwnership(prisma, storeId, id);
  if (theme.listingId && theme.status === "draft") throw new HttpError(400, "This is an Oyklane Store preview, not one of your themes.");

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

/** Removes an unpublished theme and its files. The live theme can't be
 * deleted — publish another one first. */
async function deleteTheme(prisma, storeId, id) {
  const theme = await assertThemeOwnership(prisma, storeId, id);
  if (theme.isActive) throw new HttpError(400, "This theme is live on your store. Publish another theme before deleting it.");
  await prisma.theme.delete({ where: { id } });
}

module.exports = {
  deleteTheme,
  isNewer,
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
