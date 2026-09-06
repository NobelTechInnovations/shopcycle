const { z } = require("zod");

const installThemeSchema = z.object({
  handle: z.enum(["classic", "modern"]),
});

const updateThemeSettingsSchema = z.object({
  settingsData: z.record(z.any()),
});

const upsertThemeFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const renameThemeFileSchema = z.object({
  newPath: z.string().min(1),
});

const renderDraftSchema = z.object({
  template: z.enum(["index", "product", "collection", "cart", "page", "search", "404"]),
  slug: z.string().optional(),
  templateOverride: z.record(z.any()).optional(),
  settingsOverride: z.record(z.any()).optional(),
  // Code-editor live preview: unsaved file content keyed by path, merged
  // over the theme's persisted files before rendering.
  filesOverride: z.record(z.string()).optional(),
});

module.exports = {
  installThemeSchema,
  updateThemeSettingsSchema,
  upsertThemeFileSchema,
  renameThemeFileSchema,
  renderDraftSchema,
};
