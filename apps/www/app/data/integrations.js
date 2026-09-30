/**
 * Everything Oyklane connects to. `status` is honest:
 *   built  — part of every store, set up in Settings
 *   app    — an app from the app store
 *   paid   — an app with a monthly price
 *   soon   — being built; not available yet
 * `logo` is what components/Logo.jsx draws: a real brand mark (brand), a
 * wordmark for brands without one (word), or a line icon for Oyklane's own
 * features (icon).
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
  { name: "Razorpay", category: "payments", status: "built", logo: { brand: "razorpay" }, text: "UPI, cards, net banking and wallets — money straight to your Razorpay account.", popular: true },
  { name: "Cashfree", category: "payments", status: "built", logo: { word: "cashfree" }, text: "UPI, cards, net banking and pay later, with test mode first." },
  { name: "PayU", category: "payments", status: "built", logo: { word: "payu" }, text: "One of India's widest sets of payment methods." },
  { name: "Stripe", category: "payments", status: "built", logo: { brand: "stripe" }, text: "Cards from anywhere in the world.", popular: true },
  { name: "PayPal", category: "payments", status: "built", logo: { brand: "paypal" }, text: "For buyers outside India." },
  { name: "Cash on delivery", category: "payments", status: "built", logo: { word: "cod" }, text: "On or off with one switch; mark paid when the courier settles." },
  { name: "UPI apps", category: "payments", status: "built", logo: { word: "upi" }, text: "Google Pay, PhonePe, Paytm and more through your gateway — with their icons at checkout." },
  { name: "Gift cards", category: "payments", status: "built", logo: { icon: "receipt" }, text: "Sell and accept gift cards; refunds can go back to the card." },

  // Checkout & login
  { name: "One-Click Checkout", category: "checkout", status: "app", logo: { icon: "bolt" }, text: "Phone, one-time code, saved address, pay — in a popup, from any page.", popular: true, featured: true },
  { name: "Phone Login", category: "checkout", status: "paid", logo: { icon: "phone" }, text: "Shoppers sign in with their mobile number and a code by SMS or WhatsApp. Order and delivery updates on WhatsApp are coming, included." },
  { name: "Google sign-in", category: "checkout", status: "built", logo: { brand: "google" }, text: "Continue with Google for shoppers and sellers." },
  { name: "GST at checkout", category: "checkout", status: "built", logo: { icon: "receipt" }, text: "Buyers add their GSTIN; invoices work out CGST, SGST or IGST." },

  // Shipping
  { name: "Courier tracking", category: "shipping", status: "built", logo: { icon: "truck" }, text: "Add the courier and tracking number; the shopper gets a tracking link by email." },
  { name: "Shiprocket", category: "shipping", status: "built", logo: { word: "shiprocket" }, text: "Tracking links for Shiprocket shipments. Booking labels from Oyklane is coming soon." },
  { name: "Delhivery", category: "shipping", status: "built", logo: { word: "delhivery" }, text: "Tracking links for Delhivery shipments." },
  { name: "Blue Dart, DTDC, Ekart & more", category: "shipping", status: "built", logo: { word: "bluedart" }, text: "Xpressbees, Ecom Express, Shadowfax, India Post or your own delivery." },
  { name: "Shipping rate automation", category: "shipping", status: "soon", logo: { icon: "box" }, text: "Live courier rates and label booking inside your orders." },

  // Analytics & ads
  { name: "Meta Pixel", category: "marketing", status: "app", logo: { brand: "meta" }, text: "Continue with Facebook, pick your pixel — every shopping event, checkout included.", popular: true },
  { name: "Google Analytics 4", category: "marketing", status: "app", logo: { brand: "googleanalytics" }, text: "Page views, add to cart, checkout and purchase events in GA4." },
  { name: "Meta Ads", category: "marketing", status: "app", logo: { brand: "facebook" }, text: "See and launch campaigns from your dashboard (Growth and Pro)." },
  { name: "Custom scripts", category: "marketing", status: "app", logo: { icon: "code" }, text: "Add any tag — Microsoft Clarity, Hotjar, a chat widget — to every page." },
  { name: "Product reviews", category: "marketing", status: "app", logo: { icon: "star" }, text: "Stars on every card, verified-buyer badges and CSV import." },
  { name: "Search engines", category: "marketing", status: "built", logo: { brand: "googlesearchconsole" }, text: "Sitemap, robots.txt, clean URLs and editable titles and descriptions." },

  // Email & messaging
  { name: "Order emails", category: "messaging", status: "built", logo: { icon: "mail" }, text: "Confirmation, shipping, delivery, refund and return emails in your store's name." },
  { name: "WhatsApp codes", category: "messaging", status: "built", logo: { brand: "whatsapp" }, text: "One-time sign-in and checkout codes on WhatsApp." },
  { name: "SMS codes", category: "messaging", status: "built", logo: { icon: "chat" }, text: "One-time codes by SMS (DLT-registered sender)." },
  { name: "WhatsApp Business", category: "messaging", status: "app", logo: { brand: "whatsapp" }, text: "Message customers from your dashboard (Growth and Pro)." },
  { name: "Email marketing sync", category: "messaging", status: "soon", logo: { brand: "mailchimp" }, text: "Send subscribers to Mailchimp and similar tools." },

  // Automation
  { name: "Flow", category: "automation", status: "app", logo: { icon: "flow" }, text: "Triggers, waits, conditions and emails — thank-yous, review requests, win-back, COD confirmation.", popular: true },
  { name: "Abandoned checkout emails", category: "automation", status: "built", logo: { icon: "mail" }, text: "One reminder with a link that restores the cart on any device." },
  { name: "New order alerts", category: "automation", status: "built", logo: { icon: "bell" }, text: "An email and a sound in your dashboard for every order." },

  // Developer
  { name: "REST API", category: "developer", status: "built", logo: { icon: "code" }, text: "Keys with exactly the access each tool needs — orders, products, customers." },
  { name: "Webhooks", category: "developer", status: "built", logo: { icon: "flow" }, text: "Signed events for orders, products and customers, retried until delivered." },
  { name: "Custom data", category: "developer", status: "built", logo: { icon: "layers" }, text: "Your own fields on products — fabric, fit, care — shown on the page." },
];

export const STATUS_LABEL = { built: "Built in", app: "App", paid: "Paid app", soon: "Coming soon" };
