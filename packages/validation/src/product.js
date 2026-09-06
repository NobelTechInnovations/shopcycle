const { z } = require("zod");

const variantSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).default("Default"),
  sku: z.string().optional().nullable(),
  price: z.coerce.number().nonnegative(),
  comparePrice: z.coerce.number().nonnegative().optional().nullable(),
  cost: z.coerce.number().nonnegative().optional().nullable(),
  inventoryQuantity: z.coerce.number().int().nonnegative().default(0),
  status: z.enum(["active", "draft"]).default("active"),
});

const imageSchema = z.object({
  id: z.string().optional(),
  url: z.string().url(),
  altText: z.string().optional().nullable(),
  position: z.coerce.number().int().nonnegative().default(0),
});

const createProductSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().optional().nullable(),
  status: z.enum(["active", "draft", "archived"]).default("draft"),
  vendor: z.string().optional().nullable(),
  productType: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
  seoTitle: z.string().optional().nullable(),
  seoDescription: z.string().optional().nullable(),
  variants: z.array(variantSchema).min(1, "At least one variant is required"),
  images: z.array(imageSchema).default([]),
  collectionIds: z.array(z.string()).default([]),
});

const updateProductSchema = createProductSchema.partial().extend({
  variants: z.array(variantSchema).optional(),
});

const listProductsQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["active", "draft", "archived"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

module.exports = {
  variantSchema,
  imageSchema,
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
};
