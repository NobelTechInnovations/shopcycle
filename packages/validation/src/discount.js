const { z } = require("zod");

const id = z.string().min(5).max(40);

const baseDiscountSchema = z.object({
  code: z
    .string()
    .min(2, "Code is too short")
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, - and _ only")
    .transform((v) => v.toUpperCase().trim())
    .optional(),
  /// "code" (shoppers enter it) or "automatic" (applies by itself).
  method: z.enum(["code", "automatic"]),
  title: z.string().trim().max(80).optional().nullable(),
  type: z.enum(["percentage", "fixed_amount", "free_shipping", "buy_x_get_y"]),
  value: z.coerce.number().nonnegative("Value can't be negative"),
  appliesTo: z.enum(["order", "collections", "products"]),
  targetIds: z.array(id).max(200),
  minSubtotal: z.coerce.number().nonnegative().optional().nullable(),
  minQuantity: z.coerce.number().int().positive().optional().nullable(),
  maxDiscount: z.coerce.number().positive().optional().nullable(),
  usageLimit: z.coerce.number().int().positive().optional().nullable(),
  oncePerCustomer: z.boolean(),
  buyQuantity: z.coerce.number().int().positive().max(100).optional().nullable(),
  getQuantity: z.coerce.number().int().positive().max(100).optional().nullable(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  status: z.enum(["active", "disabled"]),
});

/** Rules that need more than one field. */
function rules(d, ctx) {
  const issue = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  if (d.type === "percentage" && d.value !== undefined && (d.value <= 0 || d.value > 100)) issue("value", "Enter a percentage between 1 and 100");
  if (d.type === "fixed_amount" && d.value !== undefined && d.value <= 0) issue("value", "Enter an amount greater than 0");
  if (d.type === "buy_x_get_y") {
    if (!d.buyQuantity) issue("buyQuantity", "How many must they buy?");
    if (!d.getQuantity) issue("getQuantity", "How many do they get?");
    if (d.value !== undefined && (d.value <= 0 || d.value > 100)) issue("value", "Enter 100 for free, or a percentage off");
  }
  if (d.appliesTo && d.appliesTo !== "order" && Array.isArray(d.targetIds) && d.targetIds.length === 0) issue("targetIds", `Pick at least one ${d.appliesTo === "products" ? "product" : "collection"}`);
  if (d.method === "code" && d.code === undefined) issue("code", "Enter a code");
  if (d.method === "automatic" && d.title !== undefined && !String(d.title || "").trim()) issue("title", "Give the discount a title — shoppers see it");
  if (d.startsAt && d.endsAt && d.endsAt <= d.startsAt) issue("endsAt", "The end must be after the start");
}

// Defaults only when creating — an edit changes just what it sends.
const createDiscountSchema = baseDiscountSchema
  .extend({
    method: baseDiscountSchema.shape.method.default("code"),
    value: baseDiscountSchema.shape.value.default(0),
    appliesTo: baseDiscountSchema.shape.appliesTo.default("order"),
    targetIds: baseDiscountSchema.shape.targetIds.default([]),
    oncePerCustomer: baseDiscountSchema.shape.oncePerCustomer.default(false),
    status: baseDiscountSchema.shape.status.default("active"),
  })
  .superRefine(rules);
const updateDiscountSchema = baseDiscountSchema.partial().superRefine(rules);

const listDiscountsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["all", "active", "scheduled", "expired", "disabled"]).default("all"),
  q: z.string().trim().max(60).optional(),
});

module.exports = { createDiscountSchema, updateDiscountSchema, listDiscountsQuerySchema };
