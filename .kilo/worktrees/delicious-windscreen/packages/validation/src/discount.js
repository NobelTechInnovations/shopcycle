const { z } = require("zod");

const createDiscountSchema = z.object({
  code: z
    .string()
    .min(2, "Code is too short")
    .max(40)
    .transform((v) => v.toUpperCase().trim()),
  type: z.enum(["percentage", "fixed_amount"]),
  value: z.coerce.number().positive("Value must be greater than 0"),
  minSubtotal: z.coerce.number().nonnegative().optional().nullable(),
  usageLimit: z.coerce.number().int().positive().optional().nullable(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  status: z.enum(["active", "disabled"]).default("active"),
});

const updateDiscountSchema = createDiscountSchema.partial();

const listDiscountsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

module.exports = { createDiscountSchema, updateDiscountSchema, listDiscountsQuerySchema };
