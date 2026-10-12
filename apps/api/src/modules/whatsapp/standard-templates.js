const { env } = require("../../config/env");

/**
 * Oyklane's standard WhatsApp templates: the order updates every store
 * can send without writing its own. They're installed on Oyklane's own
 * WhatsApp account (the default sender, Super admin ▸ Messaging) and, when
 * a seller connects their own number, on theirs too — same names, so the
 * sender can switch without the seller re-doing anything.
 *
 * {{3}} is always the store's name, so a message from Oyklane's shared
 * number still says which shop it's about. The button opens the order
 * page: on the seller's own account it points at their storefront; on
 * Oyklane's account at api.oyklane.com/o/<code>, which redirects to the
 * right store.
 */

const KINDS = {
  orderConfirmed: {
    name: "oy_order_confirmed",
    label: "Order confirmed",
    events: ["order.created", "order.paid"],
    body: "Hi {{1}}, thank you for your order {{2}} from {{3}}. Your total is {{4}}. We'll message you here when it ships.",
    examples: ["Asha", "#1042", "Sonchiri Sweets", "₹1,299"],
    vars: ["customer.first_name", "order.number", "store.name", "order.total"],
    button: "View order",
  },
  shipped: {
    name: "oy_order_shipped",
    label: "Order shipped",
    events: ["order.fulfilled"],
    body: "Good news {{1}}! Your order {{2}} from {{3}} is on its way with {{4}}. Track it with the button below.",
    examples: ["Asha", "#1042", "Sonchiri Sweets", "Delhivery"],
    vars: ["customer.first_name", "order.number", "store.name", "order.courier"],
    button: "Track order",
  },
  delivered: {
    name: "oy_order_delivered",
    label: "Order delivered",
    events: ["order.delivered"],
    body: "Hi {{1}}, your order {{2}} from {{3}} has been delivered. We hope you love it! Reply here if anything isn't right.",
    examples: ["Asha", "#1042", "Sonchiri Sweets"],
    vars: ["customer.first_name", "order.number", "store.name"],
    button: "View order",
  },
};

/** Login codes on Oyklane's own number (an Authentication template). */
const OTP_TEMPLATE = "oy_login_code";

const orderLinkBase = () => `${String(env.API_PUBLIC_URL || "https://api.oyklane.com").replace(/\/$/, "")}/o/`;

/** The template builder's input (whatsapp/service.buildTemplate) for one kind. */
function builderInput(kind, { linkBase } = {}) {
  const k = KINDS[kind];
  const base = linkBase || orderLinkBase();
  return {
    name: k.name,
    category: "UTILITY",
    language: "en",
    body: { text: k.body, examples: k.examples },
    buttons: [{ type: "URL", text: k.button, url: `${base}{{1}}`, example: `${base}a1b2c3d4` }],
  };
}

/** Meta's special shape for an Authentication (one-time code) template. */
function otpSpec() {
  return {
    name: OTP_TEMPLATE,
    category: "AUTHENTICATION",
    language: "en",
    components: [
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: 10 },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copy code" }] },
    ],
  };
}

module.exports = { KINDS, OTP_TEMPLATE, builderInput, otpSpec, orderLinkBase };
