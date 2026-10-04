// Where the marketing site sends people.
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
// A live store to show visitors — only linked when one is configured.
export const DEMO_URL = process.env.NEXT_PUBLIC_DEMO_STORE_URL || "";
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "https://api.oyklane.com").replace(/\/$/, "");

export const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
