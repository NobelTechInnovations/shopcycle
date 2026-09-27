const { z } = require("zod");

const registerSchema = z.object({
  name: z.string().min(2, "Name is too short").max(120),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  storeName: z.string().min(2, "Store name is too short").max(120),
  // The plan's key (starter / growth / pro) — every new store picks one.
  plan: z.string({ required_error: "Choose a plan" }).trim().min(1, "Choose a plan").max(40),
});

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const createStoreSchema = z.object({
  storeName: z.string().min(2, "Store name is too short").max(120),
  plan: z.string({ required_error: "Choose a plan" }).trim().min(1, "Choose a plan").max(40),
});

const switchStoreSchema = z.object({
  storeId: z.string().min(1),
});

module.exports = { registerSchema, loginSchema, createStoreSchema, switchStoreSchema };
