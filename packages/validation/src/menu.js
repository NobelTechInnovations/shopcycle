const { z } = require("zod");

const menuItemSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  url: z.string().min(1),
  // Menu ▸ submenu ▸ sub-submenu.
  depth: z.coerce.number().int().min(0).max(2).default(0),
});

const createMenuSchema = z.object({
  handle: z
    .string()
    .min(1, "Handle is required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  title: z.string().min(1, "Title is required"),
  items: z.array(menuItemSchema).default([]),
  /// Put it on the live theme straight away.
  showIn: z.enum(["none", "header", "footer"]).optional(),
});

const placeMenuSchema = z.object({
  where: z.enum(["header", "footer"]),
  remove: z.boolean().optional(),
});

const updateMenuSchema = z.object({
  title: z.string().min(1).optional(),
  items: z.array(menuItemSchema).optional(),
});

module.exports = { createMenuSchema, updateMenuSchema, placeMenuSchema, menuItemSchema };
