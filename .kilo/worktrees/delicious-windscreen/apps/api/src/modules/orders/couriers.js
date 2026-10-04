/**
 * Couriers offered when marking items as shipped. `track` builds the
 * public tracking link from an AWB/tracking number — only included where
 * the courier has a stable public tracking URL; for the rest the merchant
 * pastes the link (or the shopper tracks on the courier's own site).
 */
const COURIERS = [
  { key: "shiprocket", name: "Shiprocket", track: (n) => `https://shiprocket.co/tracking/${encodeURIComponent(n)}` },
  { key: "delhivery", name: "Delhivery", track: (n) => `https://www.delhivery.com/track/package/${encodeURIComponent(n)}` },
  { key: "bluedart", name: "Blue Dart" },
  { key: "dtdc", name: "DTDC" },
  { key: "ekart", name: "Ekart" },
  { key: "xpressbees", name: "Xpressbees" },
  { key: "ecom-express", name: "Ecom Express" },
  { key: "shadowfax", name: "Shadowfax" },
  { key: "india-post", name: "India Post" },
  { key: "self", name: "Own delivery" },
  { key: "other", name: "Other" },
];

function courierByName(name) {
  const needle = String(name || "").trim().toLowerCase();
  return COURIERS.find((c) => c.name.toLowerCase() === needle || c.key === needle) || null;
}

/** The tracking link to show the shopper: what the merchant pasted, else
 * one built from the courier and number, else none. */
function trackingUrlFor({ courier, trackingNumber, trackingUrl }) {
  if (trackingUrl) return trackingUrl;
  const c = courierByName(courier);
  return c?.track && trackingNumber ? c.track(trackingNumber) : null;
}

module.exports = {
  COURIERS: COURIERS.map(({ key, name, track }) => ({ key, name, autoTracking: Boolean(track) })),
  courierByName,
  trackingUrlFor,
};
