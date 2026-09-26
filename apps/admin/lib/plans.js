/** Every row in a plan comparison, keyed to the Plan model's own fields
 * (packages/database/prisma/schema.prisma) so the list can't drift from
 * what a plan actually unlocks. `render(plan)` returns a boolean (✓/—) or
 * a string shown as-is. Shared by the first-time plan picker (/billing)
 * and Settings › Plan & billing. */
export const FEATURE_ROWS = [
  { label: "Products", render: (p) => (p.productLimit >= 100000 ? "Unlimited" : `Up to ${p.productLimit.toLocaleString("en-IN")}`) },
  { label: "Staff accounts", render: (p) => `Up to ${p.staffLimit}` },
  { label: "Commission per order", render: (p) => `${Number(p.commissionPercent)}%` },
  { label: "1-click checkout", render: () => true },
  { label: "Customizable cart", render: (p) => p.cartCustomizable },
  { label: "GST software", render: (p) => p.hasGstSoftware },
  { label: "In-built Ads Manager", render: (p) => p.hasAdsManagerIncluded },
  { label: "Meta Ads Manager", render: (p) => p.hasMetaAds },
  { label: "Paid apps included free", render: (p) => p.paidAppsIncluded },
  { label: "Premium themes included", render: (p) => p.premiumThemesIncluded },
  { label: "WhatsApp integration", render: (p) => p.hasWhatsappIntegration },
  { label: "Social media manager", render: (p) => p.hasSocialMediaManager },
  { label: "Priority support", render: (p) => p.prioritySupport },
  { label: "API access", render: (p) => p.hasApiAccess },
  { label: "CSV export (orders, customers, products)", render: (p) => p.hasCsvExport },
];

/** For billing addresses — the state decides CGST+SGST vs IGST on invoices. */
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
  "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal",
];

export function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function daysUntil(d) {
  if (!d) return null;
  return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000));
}
