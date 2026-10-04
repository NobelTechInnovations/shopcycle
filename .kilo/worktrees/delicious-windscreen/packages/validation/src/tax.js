const { z } = require("zod");

const createTaxRateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  country: z.string().min(1, "Country is required"),
  province: z.string().optional().nullable(),
  rate: z.coerce.number().nonnegative().max(100, "Rate can't exceed 100%"),
});

const updateTaxRateSchema = createTaxRateSchema.partial();

module.exports = { createTaxRateSchema, updateTaxRateSchema };
