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
  { name: "Phone Login", category: "checkout", status: "app", logo: { icon: "phone" }, text: "Shoppers sign in with their mobile number and a code by SMS or WhatsApp. Free to install; ₹0.50 per SMS code." },
  { name: "Google sign-in", category: "checkout", status: "built", logo: { brand: "google" }, text: "Continue with Google for shoppers and sellers." },
  { name: "GST at checkout", category: "checkout", status: "built", logo: { icon: "receipt" }, text: "Buyers add their GSTIN; invoices work out CGST, SGST or IGST." },

  // Shipping
  { name: "Courier tracking", category: "shipping", status: "built", logo: { icon: "truck" }, text: "Add the courier and tracking number; the shopper gets a tracking link by email." },
  { name: "Delhivery", category: "shipping", status: "soon", logo: { word: "delhivery" }, text: "One-click connection: live rates, pickup booking, labels and tracking from the order page. Tracking links work today." },
  { name: "Shiprocket", category: "shipping", status: "soon", logo: { word: "shiprocket" }, text: "One-click connection to compare couriers, book and print labels. Tracking links work today." },
  { name: "Shipmozo", category: "shipping", status: "soon", logo: { word: "shipmozo" }, text: "One-click connection for rates at checkout, labels and tracking." },
  { name: "Blue Dart, DTDC, Ekart & more", category: "shipping", status: "built", logo: { word: "bluedart" }, text: "Xpressbees, Ecom Express, Shadowfax, India Post or your own delivery." },

  // Analytics & ads
  { name: "Meta Pixel", category: "marketing", status: "app", logo: { brand: "meta" }, text: "Continue with Facebook, pick your pixel — every shopping event, checkout included.", popular: true },
  { name: "Google Analytics 4", category: "marketing", status: "app", logo: { brand: "googleanalytics" }, text: "Page views, add to cart, checkout and purchase events in GA4." },
  { name: "Meta Ads", category: "marketing", status: "app", logo: { brand: "facebook" }, text: "Create Facebook and Instagram campaigns, see results next to your real orders and approve suggestions (Growth and Pro)." },
  { name: "Google Ads", category: "marketing", status: "app", logo: { brand: "google" }, text: "Search, Shopping and Performance Max campaigns with keyword ideas and purchase tracking — or create a Google Ads account from Oyklane." },
  { name: "Google & YouTube", category: "marketing", status: "app", logo: { brand: "google" }, text: "List your products free on Google Shopping, Search, YouTube and Maps through Merchant Center, kept in sync." },
  { name: "Custom scripts", category: "marketing", status: "app", logo: { icon: "code" }, text: "Add any tag — Microsoft Clarity, Hotjar, a chat widget — to every page." },
  { name: "Product reviews", category: "marketing", status: "app", logo: { icon: "star" }, text: "Stars on every card, verified-buyer badges and CSV import." },
  { name: "Search engines", category: "marketing", status: "built", logo: { brand: "googlesearchconsole" }, text: "Sitemap, robots.txt, clean URLs and editable titles and descriptions." },

  // Email & messaging
  { name: "Order emails", category: "messaging", status: "built", logo: { icon: "mail" }, text: "Confirmation, shipping, delivery, refund and return emails in your store's name." },
  { name: "WhatsApp order updates", category: "messaging", status: "built", logo: { brand: "whatsapp" }, text: "Order confirmed, shipped and delivered on WhatsApp — from Oyklane's number with your store's name, or from your own." },
  { name: "WhatsApp codes", category: "messaging", status: "built", logo: { brand: "whatsapp" }, text: "One-time sign-in and checkout codes on WhatsApp." },
  { name: "SMS codes", category: "messaging", status: "built", logo: { icon: "chat" }, text: "One-time codes by SMS, sent by Oyklane — ₹0.50 each, added to your bill." },
  { name: "WhatsApp Business", category: "messaging", status: "app", logo: { brand: "whatsapp" }, text: "Your own number: an inbox for replies, templates and broadcasts to customers who opted in (Growth and Pro)." },
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

/** How each kind of integration connects — the steps a seller follows. */
export const GUIDES = {
  payments: {
    intro: "Money goes straight from your shopper to your own gateway account. Oyklane never holds it.",
    steps: ["Open Settings ▸ Payments in your dashboard.", "Pick your gateway and paste its keys — try test mode first if you like.", "Switch it on. Shoppers see UPI, cards, net banking and wallets at checkout, with each brand's logo.", "Refund from the order page; the gateway sends the money back."],
  },
  checkout: {
    intro: "Faster sign-in and checkout with a mobile number and a one-time code — no passwords.",
    steps: ["Open Apps and install One-Click Checkout or Phone Login.", "Choose how codes go out: SMS (built in, ₹0.50 each) or WhatsApp.", "Shoppers sign in or check out with their number and the code.", "Their saved addresses come back on any Oyklane store they shop at."],
  },
  shipping: {
    intro: "Ship with any courier today. One-click courier connections are on the way.",
    steps: ["Pack the order and book it with your courier as usual.", "On the order, click Ship and add the courier and tracking number.", "The shopper gets an email with the tracking link, and the order shows as shipped.", "Coming soon: connect Delhivery, Shiprocket or Shipmozo once to see rates and book labels from the order."],
  },
  marketing: {
    intro: "Run ads and measure them against the orders your store actually received.",
    steps: ["Open Apps ▸ Meta Ads or Google Ads.", "Sign in with Facebook or Google and choose your ad account — or create a Google Ads account from Oyklane.", "Switch on purchase tracking; Oyklane adds the pixel or tag to your store for you.", "Create campaigns with guided steps, then see results in plain words and approve suggestions."],
  },
  messaging: {
    intro: "Order emails and WhatsApp updates work from day one. Your own WhatsApp number is optional.",
    steps: ["Order emails go out in your store's name — nothing to set up.", "WhatsApp order updates go from Oyklane's number with your store's name.", "To use your own number: Apps ▸ WhatsApp ▸ connect Facebook ▸ pick your WhatsApp Business number ▸ Activate.", "Then reply from the Inbox, create your own templates and send broadcasts to customers who opted in."],
  },
  automation: {
    intro: "Emails that send themselves after the right moments.",
    steps: ["Install Flow from Apps.", "Start from a recipe — thank-you, review request, win-back — or build your own.", "Add waits and conditions, and write the email once with the customer's name and order.", "Switch it on and see every run in its history."],
  },
  developer: {
    intro: "Connect a CRM, ERP, accounting tool or your own app.",
    steps: ["Create an API key in Settings ▸ API & webhooks (Pro plan) with only the permissions it needs.", "Add webhooks for the events you care about — new orders, payments, shipments, customers.", "Call the REST API from your tool to read and update products, stock, orders and customers.", "Follow the API docs for examples and webhook signatures."],
    link: { href: "/developers", label: "Read the API docs" },
  },
};

export const STATUS_LABEL = { built: "Built in", app: "App", paid: "Paid app", soon: "Coming soon" };
