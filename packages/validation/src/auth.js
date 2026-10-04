const { z } = require("zod");

const registerSchema = z.object({
  name: z.string().min(2, "Name is too short").max(120),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  storeName: z.string().min(2, "Store name is too short").max(120),
  // The plan's key (starter / growth / pro). Optional: a store created
  // without one picks it on its first visit to the dashboard (/welcome).
  plan: z.string().trim().min(1).max(40).optional(),
});

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const createStoreSchema = z.object({
  storeName: z.string().min(2, "Store name is too short").max(120),
  plan: z.string().trim().min(1).max(40).optional(),
});

const switchStoreSchema = z.object({
  storeId: z.string().min(1),
});

module.exports = { registerSchema, loginSchema, createStoreSchema, switchStoreSchema };
