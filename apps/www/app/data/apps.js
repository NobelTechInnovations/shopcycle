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

export const APP_CATEGORY = { sales_channel: "Sales channels", selling: "Selling", automation: "Automation", checkout: "Checkout", customers: "Customers", marketing: "Marketing", analytics: "Analytics", utility: "Utilities", other: "Other" };

// Each app's logo (components/Logo.jsx): the brand's own mark for apps that
// connect a brand, an icon for Oyklane's own apps.
export const APP_LOGO = {
  flow: { icon: "flow" },
  "one-click-checkout": { icon: "bolt" },
  "phone-login": { icon: "phone" },
  "product-reviews": { icon: "star" },
  "facebook-pixel": { brand: "meta" },
  "google-analytics": { brand: "googleanalytics" },
  "meta-ads": { brand: "facebook" },
  whatsapp: { brand: "whatsapp" },
  "customer-reviews": { icon: "chat" },
  "custom-scripts": { icon: "code" },
  "instagram-feed": { brand: "instagram" },
  "google-reviews": { brand: "google" },
  "google-shopping": { brand: "google" },
  "facebook-shop": { brand: "facebook" },
  rentals: { icon: "calendar" },
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
