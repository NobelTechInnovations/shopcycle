/**
 * The starting catalog: plans and the features each includes. Seeded once
 * by bootstrap.js; after that the super admin edits plans, prices and the
 * feature matrix — this file only fills in what isn't there yet.
 */
const FEATURES = [
  // Starter — the essentials
  { key: "store", name: "Online store & custom storefront", category: "Store", sortOrder: 10 },
  { key: "catalog", name: "Products, collections & inventory", category: "Store", sortOrder: 20 },
  { key: "orders", name: "Orders & customers", category: "Store", sortOrder: 30 },
  { key: "discounts_basic", name: "Discount codes", category: "Marketing", sortOrder: 40 },
  { key: "analytics_basic", name: "Sales & traffic analytics", category: "Analytics", sortOrder: 50 },
  { key: "checkout_standard", name: "Oyklane checkout & payments", category: "Store", sortOrder: 60 },
  { key: "shipping_basic", name: "Shipping zones & rates", category: "Store", sortOrder: 70 },
  { key: "theme_basic", name: "Themes & visual editor", category: "Online store", sortOrder: 80 },
  { key: "staff", name: "Staff accounts", category: "Team", kind: "limit", sortOrder: 90 },
  // Growth
  { key: "analytics_advanced", name: "Advanced analytics & campaign tracking", category: "Analytics", sortOrder: 110 },
  { key: "discounts_advanced", name: "Advanced discounts & gift cards", category: "Marketing", sortOrder: 120 },
  { key: "marketing_tools", name: "Marketing tools (Meta Ads, WhatsApp)", category: "Marketing", sortOrder: 130 },
  { key: "customer_segments", name: "Customer segmentation", category: "Customers", sortOrder: 140 },
  { key: "reports_advanced", name: "Advanced reports & CSV exports", category: "Analytics", sortOrder: 150 },
  { key: "gst_invoices", name: "GST tax invoices to customers", category: "Store", sortOrder: 160 },
  { key: "automation", name: "Automations (abandoned cart, reminders)", category: "Marketing", sortOrder: 170 },
  { key: "shipping_advanced", name: "Advanced shipping rules", category: "Store", sortOrder: 180 },
  { key: "theme_advanced", name: "Theme code editor", category: "Online store", sortOrder: 190 },
  // Pro
  { key: "automation_advanced", name: "Advanced automation", category: "Marketing", sortOrder: 210 },
  { key: "api_access", name: "API keys & webhooks", category: "Integrations", sortOrder: 220 },
  { key: "integrations_advanced", name: "Advanced integrations", category: "Integrations", sortOrder: 230 },
  { key: "priority_support", name: "Priority support", category: "Support", sortOrder: 240 },
  { key: "premium_features", name: "Premium features & early access", category: "Support", sortOrder: 250 },
];

const STARTER = ["store", "catalog", "orders", "discounts_basic", "analytics_basic", "checkout_standard", "shipping_basic", "theme_basic"];
const GROWTH = [...STARTER, "analytics_advanced", "discounts_advanced", "marketing_tools", "customer_segments", "reports_advanced", "gst_invoices", "automation", "shipping_advanced", "theme_advanced"];
const PRO = [...GROWTH, "automation_advanced", "api_access", "integrations_advanced", "priority_support", "premium_features"];

const PLANS = [
  { key: "starter", name: "Starter", priceMonthly: 199, commissionPercent: 2.0, staffLimit: 2, sortOrder: 1, tagline: "Everything to open your store.", features: STARTER },
  { key: "growth", name: "Growth", priceMonthly: 599, commissionPercent: 1.5, staffLimit: 10, sortOrder: 2, tagline: "Marketing, reports and GST invoices for a growing brand.", features: GROWTH },
  { key: "pro", name: "Pro", priceMonthly: 1299, commissionPercent: 0.5, staffLimit: 30, sortOrder: 3, tagline: "The lowest fees, API access and priority support.", features: PRO },
];

/** Older plan flags (still read in places) → feature keys. */
const LEGACY_FLAGS = {
  hasMetaAds: "marketing_tools",
  hasWhatsappIntegration: "marketing_tools",
  hasCsvExport: "reports_advanced",
  hasGstSoftware: "gst_invoices",
  hasApiAccess: "api_access",
};

module.exports = { FEATURES, PLANS, LEGACY_FLAGS };
