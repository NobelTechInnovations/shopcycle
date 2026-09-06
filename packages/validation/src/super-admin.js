const { z } = require("zod");

const createPlanSchema = z.object({
  name: z.string().min(1, "Name is required").max(60),
  priceMonthly: z.coerce.number().nonnegative(),
  productLimit: z.coerce.number().int().positive(),
  staffLimit: z.coerce.number().int().positive(),
  description: z.string().max(500).optional().nullable(),
});

const updatePlanSchema = createPlanSchema.partial();

const settingsFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "textarea", "number"]).default("text"),
  placeholder: z.string().optional(),
});

const createAppSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  name: z.string().min(1, "Name is required").max(80),
  description: z.string().max(500).optional().nullable(),
  category: z.string().max(40).default("other"),
  iconEmoji: z.string().max(8).default("🧩"),
  settingsSchema: z.array(settingsFieldSchema).default([]),
});

const updateAppSchema = createAppSchema.partial();

const updateCompanyStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

module.exports = {
  createPlanSchema,
  updatePlanSchema,
  createAppSchema,
  updateAppSchema,
  updateCompanyStatusSchema,
};
