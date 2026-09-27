/**
 * Typed access to Store.settings (a JSON column) with defaults, so every
 * caller reads the same fallbacks instead of sprinkling `?? true` around.
 * Merchants change these in Settings ▸ General / Notifications.
 */
const DEFAULTS = {
  notifications: {
    // Email the store when a new order comes in.
    newOrderAlert: true,
    // One reminder to shoppers who reached checkout, left an email, and
    // didn't order within an hour.
    abandonedCheckout: true,
  },
  // Days after delivery (or shipping) a shopper can ask for a return from
  // their order page; 0 turns shopper-requested returns off.
  returnWindowDays: 7,
  // Printed before the serial on GST invoices: INV-2627-0001 (≤5 characters).
  invoicePrefix: "INV",
  // Products ▸ Inventory flags stock at or below this.
  lowStockThreshold: 5,
  // Online Store ▸ Preferences: the home page's search/social listing.
  seo: { title: "", description: "", image: "" },
  // Settings ▸ Checkout: which fields the checkout form asks for.
  // "required" | "optional" | "hidden" (email is always required — order
  // updates go there). marketing: the "email me offers" box — "unchecked"
  // (explicit consent) or "hidden". country: "show" the country menu, or
  // "india" to ship to India only and leave it out.
  checkout: {
    phone: "required",
    address2: "optional",
    company: "hidden",
    gstin: "hidden",
    note: "hidden",
    marketing: "unchecked",
    country: "show",
  },
};

function storeSettings(store) {
  const raw = store?.settings && typeof store.settings === "object" ? store.settings : {};
  return {
    ...DEFAULTS,
    ...raw,
    notifications: { ...DEFAULTS.notifications, ...(raw.notifications || {}) },
    seo: { ...DEFAULTS.seo, ...(raw.seo || {}) },
    checkout: { ...DEFAULTS.checkout, ...(raw.checkout || {}) },
  };
}

/** Deep-merges a partial update (from the settings form) over what's saved. */
function mergeSettings(store, patch) {
  const current = store?.settings && typeof store.settings === "object" ? store.settings : {};
  return {
    ...current,
    ...patch,
    ...(patch.notifications && { notifications: { ...(current.notifications || {}), ...patch.notifications } }),
    ...(patch.seo && { seo: { ...(current.seo || {}), ...patch.seo } }),
    ...(patch.checkout && { checkout: { ...(current.checkout || {}), ...patch.checkout } }),
  };
}

module.exports = { storeSettings, mergeSettings, SETTINGS_DEFAULTS: DEFAULTS };
