const { z } = require("zod");

const variantSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).default("Default"),
  sku: z.string().optional().nullable(),
  price: z.coerce.number().nonnegative(),
  comparePrice: z.coerce.number().nonnegative().optional().nullable(),
  cost: z.coerce.number().nonnegative().optional().nullable(),
  // Optional on purpose: an edit that leaves stock alone omits it, so the
  // save can't overwrite sales made while the form was open. New variants
  // default to 0 in the repository.
  inventoryQuantity: z.coerce.number().int().optional(),
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
  hsnCode: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "HSN codes are 4 to 8 digits")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  description: z.string().optional().nullable(),
  status: z.enum(["active", "draft", "archived"]).default("draft"),
  vendor: z.string().optional().nullable(),
  productType: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
  seoTitle: z.string().optional().nullable(),
  seoDescription: z.string().optional().nullable(),
  variants: z.array(variantSchema).min(1, "At least one variant is required"),
  images: z.array(imageSchema).default([]),
  collectionIds: z.array(z.string()).default([]),
  // Custom data values — checked against the store's field definitions
  // in modules/metafields.
  metafields: z.record(z.string().max(40), z.any()).optional(),
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
