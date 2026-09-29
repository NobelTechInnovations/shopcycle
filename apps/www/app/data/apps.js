import { API_URL } from "../components/site";

// Shown only if the API can't be reached while the page is built.
const FALLBACK = [
  { key: "flow", name: "Flow", category: "automation", priceMonthly: null, description: "Automate emails to your customers: thank first-time buyers, ask for reviews after delivery, win back quiet customers, follow up abandoned checkouts." },
  { key: "one-click-checkout", name: "One-Click Checkout", category: "checkout", priceMonthly: null, description: "Shoppers check out from the cart in a quick popup — mobile number, a one-time code, then their saved addresses and your payment options." },
  { key: "phone-login", name: "Phone Login", category: "customers", priceMonthly: 299, description: "Shoppers sign in with their mobile number and a one-time code by SMS or WhatsApp — no password or email needed." },
  { key: "product-reviews", name: "Product Reviews", category: "marketing", priceMonthly: null, description: "Star ratings on product pages and cards, a review form for shoppers, verified-buyer badges, moderation and CSV import." },
  { key: "facebook-pixel", name: "Facebook Pixel", category: "analytics", priceMonthly: null, description: "Meta Pixel on every page, checkout included." },
  { key: "google-analytics", name: "Google Analytics", category: "analytics", priceMonthly: null, description: "Google Analytics 4 on every page, checkout included." },
];

/** The app catalog exactly as Super admin ▸ Apps has it, refreshed every
 * five minutes. The page never waits on the API per visit. */
export async function getApps() {
  try {
    const res = await fetch(`${API_URL}/api/public/apps`, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return data.apps?.length ? data.apps : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export const APP_CATEGORY = { automation: "Automation", checkout: "Checkout", customers: "Customers", marketing: "Marketing", analytics: "Analytics", utility: "Utilities", other: "Other" };

// Monogram tiles for app cards (the admin uses real icons; the site keeps it light).
export const APP_TILE = {
  flow: { mono: "F", color: "#7C5CFF" },
  "one-click-checkout": { mono: "1", color: "#8B5CF6" },
  "phone-login": { mono: "OTP", color: "#0EA5E9" },
  "product-reviews": { mono: "★", color: "#F5A524" },
  "facebook-pixel": { mono: "M", color: "#0866FF" },
  "google-analytics": { mono: "GA", color: "#F9AB00" },
  "meta-ads": { mono: "Ad", color: "#1877F2" },
  whatsapp: { mono: "WB", color: "#128C7E" },
  "customer-reviews": { mono: "“", color: "#DB2777" },
  "custom-scripts": { mono: "</>", color: "#334155" },
};

/** What's being built next — shown as "coming soon", never as available. */
export const ROADMAP = [
  { name: "WhatsApp order updates", text: "Order confirmed, shipped and delivered messages on WhatsApp — included with Phone Login.", tag: "Phone Login" },
  { name: "Shipping labels & rates", text: "Book couriers and print labels from the order page, with live rates at checkout." },
  { name: "COD verification", text: "Confirm cash-on-delivery orders before they ship, to cut refused deliveries." },
  { name: "Email marketing sync", text: "Send subscribers and buyers to your email tool automatically." },
  { name: "Loyalty & referrals", text: "Points on every order and rewards for bringing friends." },
  { name: "Google Shopping", text: "List your products on Google for free, synced with your catalog." },
];
