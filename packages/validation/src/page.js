const { z } = require("zod");

const createPageSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  body: z.string().optional().nullable(),
  status: z.enum(["active", "draft"]).default("draft"),
  seoTitle: z.string().optional().nullable(),
  seoDescription: z.string().optional().nullable(),
});

const updatePageSchema = createPageSchema.partial();

const listPagesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

module.exports = { createPageSchema, updatePageSchema, listPagesQuerySchema };
