const { z } = require("zod");

const createCollectionSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().optional().nullable(),
  image: z.string().url().optional().nullable(),
  status: z.enum(["active", "draft"]).default("draft"),
  productIds: z.array(z.string()).default([]),
});

const updateCollectionSchema = createCollectionSchema.partial();

const listCollectionsQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

module.exports = { createCollectionSchema, updateCollectionSchema, listCollectionsQuerySchema };
