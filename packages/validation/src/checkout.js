const { z } = require("zod");

const checkoutSchema = z.object({
  cartId: z.string().min(1, "Missing cart"),
  sessionId: z.string().optional(),
  email: z.string().email("Enter a valid email"),
  // Whether phone, landmark, company, GSTIN and the note are asked for
  // (and required) is the store's choice — Settings ▸ Checkout, enforced
  // in checkout/service.js.
  phone: z.string().trim().max(20).optional().nullable(),
  company: z.string().trim().max(120).optional().nullable(),
  gstin: z.string().trim().max(20).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  shippingName: z.string().min(1, "Name is required"),
  shippingAddress1: z.string().min(1, "Address is required"),
  shippingAddress2: z.string().optional().nullable(),
  shippingCity: z.string().min(1, "City is required"),
  shippingProvince: z.string().min(1, "State/province is required"),
  shippingZip: z.string().min(1, "ZIP/postal code is required"),
  shippingCountry: z.string().min(1, "Country is required"),
  // "gift_card" only when a gift card covers the whole order — the API
  // decides that from the cart, whatever the form says.
  paymentMethod: z.enum(["cod", "gift_card", "razorpay", "cashfree", "payu", "stripe", "paypal"]).default("cod"),
  // The storefront address the shopper is on — where a gateway sends them
  // back after paying (…/checkout/return/:provider).
  returnBase: z.string().url().max(500).optional(),
  // The unticked-by-default "email me offers" box — explicit consent only.
  acceptsMarketing: z.boolean().default(false),
  // Placed through the One-Click Checkout popup (the app must be
  // installed — the API checks; the order records it and its fee).
  oneClick: z.boolean().default(false),
});

const verifyRazorpayPaymentSchema = z.object({
  orderId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  // The cart that paid — cleared once the payment is confirmed.
  cartId: z.string().max(100).optional(),
});

module.exports = { checkoutSchema, verifyRazorpayPaymentSchema };
