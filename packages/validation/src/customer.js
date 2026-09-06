const { z } = require("zod");

const createCustomerSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.string().email("Enter a valid email"),
  phone: z.string().optional().nullable(),
  address1: z.string().optional().nullable(),
  address2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  acceptsEmailMarketing: z.boolean().optional(),
  acceptsSmsMarketing: z.boolean().optional(),
});

const updateCustomerSchema = createCustomerSchema.partial();

const listCustomersQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

module.exports = { createCustomerSchema, updateCustomerSchema, listCustomersQuerySchema };
