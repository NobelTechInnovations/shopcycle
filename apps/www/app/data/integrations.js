/**
 * Everything Oyklane connects to. `status` is honest:
 *   built  — part of every store, set up in Settings
 *   app    — an app from the app store
 *   paid   — an app with a monthly price
 *   soon   — being built; not available yet
 * `mono` and `color` draw the logo tile (a monogram, not a brand logo).
 */
export const CATEGORIES = [
  { key: "payments", label: "Payments", icon: "card" },
  { key: "checkout", label: "Checkout & login", icon: "bolt" },
  { key: "shipping", label: "Shipping", icon: "truck" },
  { key: "marketing", label: "Analytics & ads", icon: "chart" },
  { key: "messaging", label: "Email & messaging", icon: "mail" },
  { key: "automation", label: "Automation", icon: "flow" },
  { key: "developer", label: "Developer", icon: "code" },
];

export const INTEGRATIONS = [
  // Payments
  { name: "Razorpay", category: "payments", status: "built", mono: "R", color: "#2B7BF6", text: "UPI, cards, net banking and wallets — money straight to your Razorpay account.", popular: true },
  { name: "Cashfree", category: "payments", status: "built", mono: "C", color: "#6C3BF5", text: "UPI, cards, net banking and pay later, with test mode first." },
  { name: "PayU", category: "payments", status: "built", mono: "P", color: "#1FB45F", text: "One of India's widest sets of payment methods." },
  { name: "Stripe", category: "payments", status: "built", mono: "S", color: "#635BFF", text: "Cards from anywhere in the world.", popular: true },
  { name: "PayPal", category: "payments", status: "built", mono: "PP", color: "#1A5ED6", text: "For buyers outside India." },
  { name: "Cash on delivery", category: "payments", status: "built", mono: "₹", color: "#16A34A", text: "On or off with one switch; mark paid when the courier settles." },
  { name: "UPI apps", category: "payments", status: "built", mono: "U", color: "#0F766E", text: "Google Pay, PhonePe, Paytm and more through your gateway — with their icons at checkout." },
  { name: "Gift cards", category: "payments", status: "built", mono: "G", color: "#DB2777", text: "Sell and accept gift cards; refunds can go back to the card." },

  // Checkout & login
  { name: "One-Click Checkout", category: "checkout", status: "app", mono: "1", color: "#7C5CFF", text: "Phone, one-time code, saved address, pay — in a popup, from any page.", popular: true, featured: true },
  { name: "Phone Login", category: "checkout", status: "paid", mono: "OTP", color: "#0EA5E9", text: "Shoppers sign in with their mobile number and a code by SMS or WhatsApp. Order and delivery updates on WhatsApp are coming, included." },
  { name: "Google sign-in", category: "checkout", status: "built", mono: "G", color: "#EA4335", text: "Continue with Google for shoppers and sellers." },
  { name: "GST at checkout", category: "checkout", status: "built", mono: "GST", color: "#F59E0B", text: "Buyers add their GSTIN; invoices work out CGST, SGST or IGST." },

  // Shipping
  { name: "Courier tracking", category: "shipping", status: "built", mono: "TR", color: "#2DD4BF", text: "Add the courier and tracking number; the shopper gets a tracking link by email." },
  { name: "Shiprocket", category: "shipping", status: "built", mono: "SR", color: "#7B3FE4", text: "Tracking links for Shiprocket shipments. Booking labels from Oyklane is coming soon." },
  { name: "Delhivery", category: "shipping", status: "built", mono: "D", color: "#E11D48", text: "Tracking links for Delhivery shipments." },
  { name: "Blue Dart, DTDC, Ekart & more", category: "shipping", status: "built", mono: "+8", color: "#475569", text: "Xpressbees, Ecom Express, Shadowfax, India Post or your own delivery." },
  { name: "Shipping rate automation", category: "shipping", status: "soon", mono: "₹→", color: "#64748B", text: "Live courier rates and label booking inside your orders." },

  // Analytics & ads
  { name: "Meta Pixel", category: "marketing", status: "app", mono: "M", color: "#0866FF", text: "Continue with Facebook, pick your pixel — every shopping event, checkout included.", popular: true },
  { name: "Google Analytics 4", category: "marketing", status: "app", mono: "GA", color: "#F9AB00", text: "Page views, add to cart, checkout and purchase events in GA4." },
  { name: "Meta Ads", category: "marketing", status: "app", mono: "Ad", color: "#1877F2", text: "See and launch campaigns from your dashboard (Growth and Pro)." },
  { name: "Custom scripts", category: "marketing", status: "app", mono: "</>", color: "#334155", text: "Add any tag — Microsoft Clarity, Hotjar, a chat widget — to every page." },
  { name: "Product reviews", category: "marketing", status: "app", mono: "★", color: "#F5A524", text: "Stars on every card, verified-buyer badges and CSV import." },
  { name: "Search engines", category: "marketing", status: "built", mono: "SEO", color: "#22C55E", text: "Sitemap, robots.txt, clean URLs and editable titles and descriptions." },

  // Email & messaging
  { name: "Order emails", category: "messaging", status: "built", mono: "@", color: "#8B6CFF", text: "Confirmation, shipping, delivery, refund and return emails in your store's name." },
  { name: "WhatsApp codes", category: "messaging", status: "built", mono: "WA", color: "#25D366", text: "One-time sign-in and checkout codes on WhatsApp." },
  { name: "SMS codes", category: "messaging", status: "built", mono: "SMS", color: "#0EA5E9", text: "One-time codes by SMS (DLT-registered sender)." },
  { name: "WhatsApp Business", category: "messaging", status: "app", mono: "WB", color: "#128C7E", text: "Message customers from your dashboard (Growth and Pro)." },
  { name: "Email marketing sync", category: "messaging", status: "soon", mono: "Mc", color: "#64748B", text: "Send subscribers to Mailchimp and similar tools." },

  // Automation
  { name: "Flow", category: "automation", status: "app", mono: "F", color: "#7C5CFF", text: "Triggers, waits, conditions and emails — thank-yous, review requests, win-back, COD confirmation.", popular: true },
  { name: "Abandoned checkout emails", category: "automation", status: "built", mono: "AC", color: "#F97316", text: "One reminder with a link that restores the cart on any device." },
  { name: "New order alerts", category: "automation", status: "built", mono: "!", color: "#EAB308", text: "An email and a sound in your dashboard for every order." },

  // Developer
  { name: "REST API", category: "developer", status: "built", mono: "API", color: "#2DD4BF", text: "Keys with exactly the access each tool needs — orders, products, customers." },
  { name: "Webhooks", category: "developer", status: "built", mono: "WH", color: "#8B6CFF", text: "Signed events for orders, products and customers, retried until delivered." },
  { name: "Custom data", category: "developer", status: "built", mono: "{}", color: "#F472B6", text: "Your own fields on products — fabric, fit, care — shown on the page." },
];

export const STATUS_LABEL = { built: "Built in", app: "App", paid: "Paid app", soon: "Coming soon" };
