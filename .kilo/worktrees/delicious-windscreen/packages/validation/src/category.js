const { z } = require("zod");

const createCategorySchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  image: z.string().url().optional().nullable(),
});

const updateCategorySchema = createCategorySchema.partial();

const listCategoriesQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

module.exports = { createCategorySchema, updateCategorySchema, listCategoriesQuerySchema };
