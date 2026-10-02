const { z } = require("zod");

/** A theme template's name after the dot: product.<suffix>.json. */
const TEMPLATE_SUFFIX = /^[a-z0-9][a-z0-9-]{0,29}$/;
const templateSuffixField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(TEMPLATE_SUFFIX, "Template names use letters, numbers and dashes")
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));

const installThemeSchema = z.object({
  // Keep in step with MASTER_THEMES (apps/api/src/modules/themes/service.js).
  handle: z.enum(["classic", "modern", "atelier", "lumiere"]),
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
  // A page, or one of its extra templates ("product.rental").
  template: z.string().regex(/^(index|product|collection|cart|page|search|404)(\.[a-z0-9][a-z0-9-]{0,29})?$/, "Unknown template"),
  slug: z.string().optional(),
  templateOverride: z.record(z.any()).optional(),
  settingsOverride: z.record(z.any()).optional(),
  // Code-editor live preview: unsaved file content keyed by path, merged
  // over the theme's persisted files before rendering.
  filesOverride: z.record(z.string()).optional(),
});

const createTemplateSchema = z.object({
  kind: z.enum(["product", "page", "collection"]),
  name: z.string().trim().min(1, "Name the template").max(40),
  // An existing template of the same kind to start from ("" = the default).
  basedOn: z.string().trim().max(30).optional().nullable(),
});

module.exports = {
  TEMPLATE_SUFFIX,
  templateSuffixField,
  createTemplateSchema,
  installThemeSchema,
  updateThemeSettingsSchema,
  upsertThemeFileSchema,
  renameThemeFileSchema,
  renderDraftSchema,
};
