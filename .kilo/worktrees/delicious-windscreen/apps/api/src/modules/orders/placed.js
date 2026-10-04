const { PROVIDER_KEYS } = require("../payments/providers");

/**
 * An order the store really has: paid, cash on delivery, or a gift card —
 * never an online checkout whose payment didn't go through (the shopper
 * cancelled or closed the gateway). Those stay out of Orders, the dashboard,
 * analytics and exports; the cart they came from shows under Abandoned
 * checkouts instead, and a late payment turns them into a real order.
 */
const PLACED = { NOT: { AND: [{ paymentMethod: { in: PROVIDER_KEYS } }, { paymentStatus: "pending" }] } };

module.exports = { PLACED, PROVIDER_KEYS };
