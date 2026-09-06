const { z } = require("zod");

const checkoutSchema = z.object({
  cartId: z.string().min(1, "Missing cart"),
  sessionId: z.string().optional(),
  email: z.string().email("Enter a valid email"),
  phone: z.string().min(1, "Phone is required"),
  shippingName: z.string().min(1, "Name is required"),
  shippingAddress1: z.string().min(1, "Address is required"),
  shippingAddress2: z.string().optional().nullable(),
  shippingCity: z.string().min(1, "City is required"),
  shippingProvince: z.string().min(1, "State/province is required"),
  shippingZip: z.string().min(1, "ZIP/postal code is required"),
  shippingCountry: z.string().min(1, "Country is required"),
  paymentMethod: z.enum(["cod", "razorpay"]).default("cod"),
});

const verifyRazorpayPaymentSchema = z.object({
  orderId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

module.exports = { checkoutSchema, verifyRazorpayPaymentSchema };
