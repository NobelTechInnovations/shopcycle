/** Where things are. The API is called from this app's server only (the
 * developer's token never reaches the browser). */
export const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
export const ADMIN_ORIGIN = (process.env.NEXT_PUBLIC_ADMIN_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://oyklanestore.com").replace(/\/$/, "");
export const MAIN_SITE = "https://oyklane.com";
export const PARTNER_COOKIE = "oy_partner";

/** The seller's admin page for getting a listing (they're signed in there). */
export const getUrl = (kind, slug) => `${ADMIN_ORIGIN}/admin/market/${kind}/${encodeURIComponent(slug)}`;

export const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const CATEGORY_LABELS = {
  fashion: "Fashion & clothing",
  food: "Food & grocery",
  jewellery: "Jewellery",
  electronics: "Electronics",
  beauty: "Beauty",
  home: "Home & living",
  general: "Any shop",
  marketing: "Marketing",
  sales: "Sales & checkout",
  shipping: "Shipping",
  reviews: "Reviews",
  "customer-support": "Customer support",
  analytics: "Analytics",
  "store-design": "Store design",
  other: "Other",
};

/** Screenshots of Oyklane's own themes (public/showcase). */
const OFFICIAL_SHOTS = {
  classic: ["/showcase/classic.webp"],
  modern: ["/showcase/modern.webp"],
  atelier: ["/showcase/atelier.webp", "/showcase/atelier-product.webp", "/showcase/atelier-mobile.webp"],
  lumiere: ["/showcase/lumiere.webp"],
};
export const withShots = (item) => (item?.official && item.kind === "theme" && !item.screenshots?.length && OFFICIAL_SHOTS[item.slug] ? { ...item, screenshots: OFFICIAL_SHOTS[item.slug] } : item);
