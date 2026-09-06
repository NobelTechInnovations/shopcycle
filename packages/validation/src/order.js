const { z } = require("zod");

const orderItemInputSchema = z.object({
  productId: z.string().optional().nullable(),
  variantId: z.string().optional().nullable(),
  title: z.string().min(1),
  sku: z.string().optional().nullable(),
  quantity: z.coerce.number().int().positive(),
  price: z.coerce.number().nonnegative(),
});

const createOrderSchema = z.object({
  customerId: z.string().optional().nullable(),
  currency: z.string().default("INR"),
  discount: z.coerce.number().nonnegative().default(0),
  shipping: z.coerce.number().nonnegative().default(0),
  tax: z.coerce.number().nonnegative().default(0),
  paymentStatus: z.enum(["pending", "paid", "refunded"]).default("pending"),
  items: z.array(orderItemInputSchema).min(1, "At least one line item is required"),
});

const updateOrderStatusSchema = z.object({
  paymentStatus: z.enum(["pending", "paid", "refunded"]).optional(),
  fulfillmentStatus: z.enum(["unfulfilled", "fulfilled", "cancelled"]).optional(),
});

const listOrdersQuerySchema = z.object({
  status: z.enum(["all", "unfulfilled", "fulfilled", "cancelled"]).default("all"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

module.exports = {
  orderItemInputSchema,
  createOrderSchema,
  updateOrderStatusSchema,
  listOrdersQuerySchema,
};
