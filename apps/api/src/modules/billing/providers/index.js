const { env } = require("../../../config/env");
const razorpay = require("./razorpay");
const sandbox = require("./sandbox");

/**
 * The billing engine talks to a payment provider only through this
 * interface, so another provider can be added beside Razorpay:
 *
 *   createCustomer · createMandateOrder · createPaymentOrder ·
 *   checkoutOptions · verifyCheckoutSignature · fetchPayment ·
 *   fetchMandate · charge · refund · cancelMandate · verifyWebhook ·
 *   parseWebhook
 */
const PROVIDERS = { razorpay, sandbox };

/** "razorpay" (keys set), "sandbox" (local, BILLING_SANDBOX=true) or
 * "unconfigured" (sellers can't pay yet). */
function billingMode() {
  if (razorpay.configured()) return "razorpay";
  return env.BILLING_SANDBOX ? "sandbox" : "unconfigured";
}

function provider(name) {
  if (name && PROVIDERS[name]) return PROVIDERS[name];
  const mode = billingMode();
  return mode === "sandbox" ? sandbox : razorpay;
}

module.exports = { provider, billingMode, PROVIDERS };
