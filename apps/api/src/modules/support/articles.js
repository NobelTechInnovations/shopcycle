/**
 * The help centre. Articles live in the database (Super admin ▸ Support ▸
 * Articles edits them); this file only holds the starter set, written once
 * into an empty table, and the search the assistant and the seller's Help
 * page share.
 */

const CATEGORIES = [
  { key: "getting-started", label: "Getting started" },
  { key: "products", label: "Products & inventory" },
  { key: "orders", label: "Orders & customers" },
  { key: "payments", label: "Payments & checkout" },
  { key: "shipping", label: "Shipping & taxes" },
  { key: "design", label: "Store design" },
  { key: "domains", label: "Domains" },
  { key: "apps", label: "Apps & automation" },
  { key: "marketing", label: "Marketing & analytics" },
  { key: "billing", label: "Plan & billing" },
  { key: "account", label: "Account & team" },
];

const a = (slug, category, title, keywords, body) => ({ slug, category, title, keywords, body: body.trim() });

const SEED = [
  a("launch-checklist", "getting-started", "Your launch checklist", ["start", "setup", "launch", "open", "first", "begin", "new store"], `
Most stores go live in an afternoon. Work through these in order:

- **Add your products** — Products ▸ Add product. Add photos, a price, and sizes or colours as options.
- **Pick and style a theme** — Online Store ▸ Themes ▸ Customize. Change colours, fonts, logo and home-page sections.
- **Turn on payments** — Settings ▸ Payments. Connect Razorpay, Cashfree, PayU, Stripe or PayPal, and switch cash on delivery on or off.
- **Set shipping rates** — Settings ▸ Shipping and delivery.
- **Write your policies** — Settings ▸ Policies creates refund, shipping, privacy and terms pages from templates; they're linked in your store's footer automatically.
- **Connect your domain** (optional) — Settings ▸ Domains. Your free yourname.oyklane.com address works from day one.
- **Place a test order** — open your store with View store (top right) and buy something with cash on delivery, then cancel it in Orders.
`),
  a("add-products", "products", "Add products, sizes and colours", ["product", "variant", "size", "colour", "color", "option", "sku", "price", "photo", "image"], `
Go to **Products ▸ Add product**.

- **Title, description and photos** — drag photos to reorder; the first is the main one.
- **Price** — the selling price, plus an optional "compare at" price to show a strike-through.
- **Options** — add Size and Colour (or anything else). Oyklane makes a variant for every combination; give each its own price, SKU and stock.
- **Colour photos** — assign a photo to each colour so the picture changes when a shopper picks it.
- **Inventory** — set stock per variant. Products ▸ Inventory lets you update many at once.
- **HSN code and GST** — needed if you issue GST invoices.

Save as a draft to keep it hidden, or set it Active to publish it.
`),
  a("import-products", "products", "Import products from a CSV", ["import", "csv", "bulk", "upload", "shopify export", "spreadsheet"], `
On **Products**, choose **Import** and upload a CSV. The import modal shows the columns it understands and lets you download a sample file. Each row is a variant; rows with the same handle become one product with several variants.

Tips:
- Image columns take public image URLs; Oyklane downloads and stores them.
- Run a small file first (5–10 products) to check the result.
- Reviews can be imported separately from the Product Reviews app, matched by product.
`),
  a("collections-vs-categories", "products", "Collections, categories and brands — what's the difference?", ["collection", "category", "brand", "group", "organise", "filter"], `
- **Categories** (Products ▸ Categories) describe *what a product is* — Shirts, Kurtas, Sweets. Each product has one. Shoppers filter by it.
- **Collections** (Collections) are *groups you put together to sell* — "New arrivals", "Diwali gifts", "Under ₹999". A product can be in many collections, and collections get their own page and menu links.
- **Brands** (Products ▸ Brands) are who makes it, useful if you sell several brands.

Collection and search pages have filters (price, availability, category, brand, options) built in.
`),
  a("inventory-stock", "products", "Track stock and low-stock alerts", ["stock", "inventory", "out of stock", "quantity", "sold out", "low stock"], `
Stock is tracked per variant. It goes down when an order is placed and back up when an order is cancelled (you choose whether to restock).

- **Products ▸ Inventory** — see and edit stock for everything in one table, with a history of every change.
- **Sold-out variants** show crossed out on the product page and can't be added to the cart.
- **Low-stock threshold** — Settings ▸ Notifications. Products at or below it show on your Home dashboard's to-do list.
`),
  a("manage-orders", "orders", "Fulfil, ship and complete orders", ["order", "fulfil", "fulfill", "ship", "tracking", "courier", "deliver", "packing"], `
Open an order from **Orders**.

- **Ship** — click Mark as shipped, choose the items (partial shipments are fine), add the courier and tracking number. The customer gets a shipping email with a tracking link.
- **Delivered** — mark the shipment delivered when it arrives; the customer is told.
- **Cash on delivery** — when the courier pays you, click Mark as paid.
- **Invoice** — download or print the GST invoice from the order (Growth and Pro plans).
- **Timeline** — every email, payment and change is listed at the bottom, and you can add notes.

Unpaid online orders (the shopper closed the payment page) are not orders: they appear in Abandoned checkouts instead, and are released after two hours.
`),
  a("cancel-refund-return", "orders", "Cancel, refund or accept a return", ["cancel", "refund", "return", "exchange", "money back", "rto"], `
- **Cancel** an unshipped order from its page: choose whether to restock and refund. Online payments are refunded back through the gateway automatically.
- **Refund** part or all of a paid order with Refund on the order page.
- **Returns** — shoppers can request a return from their order page if returns are on (Settings ▸ Notifications). Approve, receive and refund them in Orders ▸ Returns.

A shipped order can't be cancelled — cancel the shipment first, or treat it as a return.
`),
  a("abandoned-checkouts", "orders", "Abandoned checkouts and cart reminders", ["abandoned", "cart", "reminder", "recover", "left", "didn't buy"], `
When a shopper enters their email at checkout (or is signed in) and doesn't order, the checkout appears in **Orders ▸ Abandoned checkouts**.

After your delay (an hour by default) they get one reminder email with a link that restores their cart on any device. Turn it on or off in Settings ▸ Notifications.

Want a second reminder a day later, only for people who didn't come back? Install the **Flow** app and use the "Second abandoned-checkout reminder" recipe.
`),
  a("customers", "orders", "Customers, accounts and phone login", ["customer", "account", "login", "sign in", "phone login", "otp", "shopper"], `
Everyone who orders becomes a customer (**Customers**), with their orders, total spent and address.

Shoppers can sign in to see their orders and saved addresses:
- **Email** — a one-time code, or a password if they set one.
- **Phone** — install the **Phone Login** app: they sign in with their mobile number and a one-time code by SMS or WhatsApp. When it's installed, your store's sign-in is phone-only.

Numbers and emails given at checkout are linked to the customer, so their orders show up when they sign in later.
`),
  a("connect-payments", "payments", "Connect a payment gateway", ["payment", "gateway", "razorpay", "cashfree", "payu", "stripe", "paypal", "upi", "card", "keys", "api key"], `
Go to **Settings ▸ Payments** and choose Connect on a gateway.

- **Razorpay** — Key ID and Key Secret from Razorpay Dashboard ▸ Account & Settings ▸ API Keys.
- **Cashfree** — App ID and Secret Key from Cashfree ▸ Developers ▸ API Keys.
- **PayU** — Merchant Key and Salt from PayU Dashboard ▸ Developers.
- **Stripe** — Publishable and Secret keys. **PayPal** — Client ID and Secret.

Start in **test mode** with the gateway's test keys, place an order, then switch to live keys. Money goes straight to your gateway account — Oyklane never holds it. Each gateway's methods (UPI, cards, net banking, wallets) show at checkout automatically.
`),
  a("cash-on-delivery", "payments", "Cash on delivery", ["cod", "cash on delivery", "cash", "rto"], `
Turn cash on delivery on or off in **Settings ▸ Payments ▸ Manual payments**.

COD orders are placed straight away and show as Payment pending until you click **Mark as paid** on the order after the courier settles. To reduce refused deliveries, the Flow app's "Confirm cash on delivery orders" recipe reminds buyers of the amount to keep ready.
`),
  a("one-click-checkout", "payments", "One-Click Checkout", ["one click", "one-click", "fast checkout", "popup", "express", "quick checkout"], `
The **One-Click Checkout** app (Apps) lets shoppers check out in a popup from the cart: mobile number → a one-time code → saved address → payment, without leaving the page. Returning buyers' addresses are filled in for them, including addresses used on other Oyklane stores.

It adds a small fee on orders paid through it (see Settings ▸ Plan & billing). If the shopper cancels a payment, they're taken back to the page they were on with the popup reopened.
`),
  a("checkout-fields", "payments", "Choose what checkout asks for", ["checkout", "fields", "gstin", "landmark", "company", "note", "form"], `
**Settings ▸ Checkout** lets you choose which fields to show — mobile number, landmark, company, GSTIN, a gift note — and which are required. The PIN code fills the state automatically.
`),
  a("shipping-rates", "shipping", "Set up shipping rates", ["shipping", "delivery", "rate", "zone", "free shipping", "charges"], `
**Settings ▸ Shipping and delivery**: create zones (for example "India") and add rates — a flat rate, free shipping above an order amount, or rates by order price. Shoppers see the matching rates at checkout.
`),
  a("gst-taxes", "shipping", "GST, taxes and invoices", ["gst", "tax", "invoice", "hsn", "gstin", "cgst", "sgst", "igst"], `
- **Tax rates** — Settings ▸ Taxes. Choose whether prices include tax.
- **GST invoices** (Growth and Pro plans) — add your GSTIN and business address in Settings ▸ General, and HSN codes on products. Invoices work out CGST+SGST or IGST from the shipping state and include the buyer's GSTIN when they give one at checkout. They're issued when an order ships.
`),
  a("customize-theme", "design", "Customize your theme", ["theme", "design", "colour", "font", "logo", "banner", "section", "editor", "home page", "layout"], `
**Online Store ▸ Themes ▸ Customize** opens the editor.

- **Theme settings** — colours, fonts, logo, favicon, buttons.
- **Sections** — add, remove and drag sections on each page (banners, featured products, collections, testimonials, text).
- **Product page** — reorder blocks (title, price, options, add to cart, badges), change sizes or hide what you don't need.

Changes are saved as a draft until you **Publish**. There are four themes — Atelier, Lumière, Modern and Classic — and a code editor if you want it.
`),
  a("menus-pages", "design", "Menus, pages and blog", ["menu", "navigation", "page", "about", "contact", "blog", "footer"], `
- **Content ▸ Pages** — About, Contact and other pages.
- **Content ▸ Navigation** — the header and footer menus. Link to collections, products, pages or any URL.
- **Content ▸ Blog posts** — write posts with images; they get their own pages.
- Policy pages from Settings ▸ Policies are linked in the footer automatically.
`),
  a("custom-domain", "domains", "Connect your own domain", ["domain", "dns", "cname", "a record", "ssl", "https", "godaddy", "hostinger", "url", "website address"], `
Every store has a free **yourname.oyklane.com** address. To use your own domain:

1. Go to **Settings ▸ Domains** and enter your domain (e.g. www.yourbrand.com).
2. Oyklane shows the DNS records to add. Open your domain provider's DNS settings (GoDaddy, Hostinger, Namecheap…), delete any old A or CNAME record for the same name, and add the records exactly as shown.
3. Come back and check — it usually goes live within an hour, sometimes up to 48 hours. SSL (https) is set up automatically.

Your oyklane.com address keeps working and forwards to your domain once it's live.
`),
  a("apps-overview", "apps", "Install, open and remove apps", ["app", "apps", "install", "uninstall", "remove", "plugin", "extension", "sidebar"], `
**Apps** lists everything you can add: Flow, One-Click Checkout, Phone Login, Product Reviews, Meta Pixel, Google Analytics, Meta Ads, WhatsApp, Testimonials and Custom Scripts.

Installed apps are pinned in your sidebar under **Apps** — click one to open it. Use its **⋯** menu to open settings or uninstall. Paid apps are added to your next bill for every billing period they're installed; removing one stops future charges.
`),
  a("flow-automation", "apps", "Automate customer emails with Flow", ["flow", "automation", "automate", "workflow", "email customers", "trigger", "review request", "win back", "thank you email"], `
Install **Flow** from Apps, then open it from your sidebar.

A flow is: **a trigger** (order placed, shipped, delivered, cancelled, refunded, customer signed up, checkout abandoned) → **steps** in order:
- **Wait** — minutes, hours or days.
- **Check a condition** — e.g. first order, order total at least ₹2,000, paid by cash on delivery, customer accepts marketing. If it isn't true, the flow stops for that customer.
- **Email the customer** — your words with placeholders like {{customer.first_name}} and {{order.number}}, an optional button, discount code and order summary.
- **Email me** — a note to you.

Start from a recipe (thank first-time buyers, review requests, win-back, COD confirmation…), edit it, **Send a test** to yourself, then turn it on. Each flow runs once per order or customer, and its activity shows every run.
`),
  a("product-reviews", "apps", "Product reviews", ["review", "rating", "stars", "testimonial", "feedback"], `
Install **Product Reviews** from Apps. Shoppers can review products they bought (verified-buyer badge), stars show on product cards, and you can reply, hide or feature reviews in the app. Import existing reviews from a CSV matched by product.
`),
  a("meta-pixel-analytics", "marketing", "Meta Pixel, Google Analytics and reports", ["pixel", "facebook", "meta", "google analytics", "ga4", "tracking", "analytics", "conversion", "report"], `
- **Meta Pixel** — install the Facebook Pixel app and choose Continue with Facebook to pick your pixel (or paste the ID). Page views, add to cart, checkout and purchase are all sent.
- **Google Analytics** — install the app and paste your G- measurement ID.
- **Oyklane analytics** — Analytics shows sales, sessions, conversion, top products and live visitors; Analytics ▸ Reports has downloadable reports.
`),
  a("discounts-gift-cards", "marketing", "Discount codes and gift cards", ["discount", "coupon", "code", "offer", "sale", "gift card", "voucher"], `
- **Discounts** — create a code for a percentage or a fixed amount off, with an optional minimum order, start and end dates, and a usage limit. Free shipping above an amount is set on your shipping rates instead (Settings ▸ Shipping and delivery).
- **Gift cards** — Products ▸ Gift cards: issue a card with a balance and email it; shoppers use it at checkout.

Use a discount code inside a Flow email (e.g. win-back) by typing the code into the email step.
`),
  a("plans-billing", "billing", "Plans, trial and billing", ["plan", "billing", "price", "trial", "subscription", "upgrade", "downgrade", "invoice", "autopay", "mandate", "fee", "commission"], `
**Settings ▸ Plan & billing** shows your plan, trial, next bill, fees and invoices.

- Every store starts with a free trial; add a payment method (UPI AutoPay or card) to continue after it.
- Plans have a monthly price plus a small fee on each paid order; GST is added on top.
- **Upgrade** anytime (applies immediately, charged for the rest of the period); **downgrades** apply at the end of the period.
- If a payment fails, you get reminders and a grace period before the dashboard is locked; the storefront stays live longer.
- Paid apps (like Phone Login) are added to the bill for each period they're installed.
`),
  a("team-staff", "account", "Add staff and set permissions", ["staff", "team", "user", "permission", "role", "invite", "employee"], `
**Settings ▸ Users & permissions** — invite people by email and choose a role (admin or staff). How many people you can add depends on your plan. Staff can't install paid apps or change billing.
`),
  a("account-security", "account", "Password, two-step sign-in and signing out", ["password", "forgot", "reset", "security", "2fa", "sign out", "logout", "hacked"], `
- **Forgot password** — on the login page choose Forgot password; the link is emailed to you.
- **Sign out everywhere** — account menu (your initials, top right) ▸ Sign out of all devices.
- **Several stores** — the store switcher (top right) lets you create and switch stores with one login.
`),
  a("contact-support", "getting-started", "Contact the Oyklane team", ["support", "help", "contact", "ticket", "human", "agent", "call", "email"], `
Ask the assistant first (Help, top right) — it answers from these articles and knows your store's setup. If it doesn't solve it, choose **I still need help** to open a ticket: the conversation is attached, and our reply comes to your email and to **Help ▸ Your tickets**.
`),
];

// Articles for features added after the starter set went in. Each batch is
// added once (a platform setting remembers it), so an article the team
// deleted on purpose doesn't come back.
const ADDED = {
  "help-articles-2026-10-02": [
    a("theme-templates", "design", "Different layouts for some products, pages or collections", ["template", "layout", "custom page", "product page", "alternate", "different", "landing"], `
Make a second layout and choose it only where you want it — like Shopify's alternate templates.

- Open **Online Store ▸ Themes ▸ Customize** and click **+ Template** at the top. Pick Products, Collections or Pages, give it a name (for example "Size guide" or "Bridal"), and start from the default layout or another template.
- Arrange it like any page: for products, click **Product** to reorder or hide its parts (price, size picker, buy buttons, text blocks…); add your theme's sections above or below — a banner, images with text, a video. Pages can hide their title; collections keep their products and filters.
- Use it: open the product, collection or page in the admin and choose it under **Layout ▸ Theme template**. Everything else keeps the default.
- Delete a template from the **…** next to its name in Customize. Anything that used it goes back to the default.
- Your own pages (About us, Contact…) are listed under **Your pages** in the page menu at the top of Customize — pick one to arrange the template it uses while looking at it.
`),
    a("rentals", "apps", "Rent products out by the day (Rentals app)", ["rent", "rental", "per day", "booking", "hire", "lend", "deposit", "lehenga", "dress on rent", "calendar"], `
Install **Rentals** from **Apps**. Then:

- Open a product and turn on **Rent this product**: rent per day, cheaper daily rates from a number of days (for example ₹800/day from 3 days), a refundable deposit, how many pieces of each size you own, the shortest and longest rental, days kept free after each rental (cleaning) and how much notice you need. The selling price isn't used — it can be 0.
- Its page on your store now shows the daily rent and a **booking calendar**: booked days are greyed out per size, shoppers choose delivery or pickup and how it comes back, and see the total.
- **Apps ▸ Rentals ▸ Settings**: let shoppers **pay at checkout** (the rent goes in the cart; dates are booked when the order is placed and freed if it's cancelled) or **send a request** you confirm by phone (no payment on the store). Also: who delivers and collects, your pickup address, when the deposit is collected, a late fee per day and your rental terms.
- **Apps ▸ Rentals ▸ Today** shows requests to confirm, what goes out and comes back today and tomorrow, and late returns — with Call and WhatsApp buttons. Mark pieces **Handed over** (tick "deposit collected") and **Returned** (a late fee is suggested), then give the deposit back.
- **Add booking** for phone or shop rentals, and **Block dates** for repairs or a photo shoot. The **Calendar** tab shows the whole month.
`),
    a("sell-on-google", "marketing", "Sell on Google (Google & YouTube app)", ["google", "merchant center", "google shopping", "free listings", "youtube", "feed", "google ads"], `
Install **Google & YouTube** from **Apps** to list your products on Google Shopping, Search, Images, YouTube and Maps — free listings through Google Merchant Center.

- **Sign in with Google** using the account that has your Merchant Center (create one free at merchants.google.com, country India), then pick the Merchant Center account. We add your product feed to it; Google reads your products every day and again when you press **Sync now**. Already signed in with Google for another app (like Google Reviews)? You just pick the account.
- Or copy the **feed link** on the app's page and add it in Merchant Center yourself (Products ▸ Add products ▸ from a file ▸ link, daily).
- In Merchant Center, fill in your business details, shipping and returns. To verify your website, choose "Add an HTML tag", paste it into **Verify your website** on the app's page, save, then press Verify there.
- The app lists products that need attention (no photo, no price) — rented and hidden products aren't sent. On each product's page, **Sales channels** lets you keep it off Google and choose its Google category.
`),
    a("sell-on-facebook-instagram", "marketing", "Sell on Facebook & Instagram", ["facebook shop", "instagram shopping", "catalog", "catalogue", "meta", "product tags", "commerce manager", "marketplace"], `
Install **Facebook & Instagram** from **Apps** to put your products in a Meta catalogue — for a shop on your Facebook Page and Instagram profile, product tags in posts and reels, and catalogue ads.

- **Continue with Facebook** (once for your store — skipped if another Meta app already did it), then pick a catalogue or let us create one. We add your store's feed to it; Meta reads your products every hour, for good.
- Or copy the **feed link** and add it in Commerce Manager yourself (Catalogue ▸ Data sources ▸ Data feed ▸ scheduled, hourly).
- Verify your domain in Business settings ▸ Domains ("Meta-tag verification"): paste the tag into **Verify your domain** on the app's page and save.
- Shoppers buy on your store. Facebook Marketplace listings for businesses aren't open to new shops.
- Keep a product off Facebook & Instagram from **Sales channels** on its page.
`),
  ],
  "help-articles-2026-10-02b": [
    a("theme-editor-save", "design", "Saving or discarding changes in Customize", ["save", "discard", "undo", "theme editor", "customize", "changes lost", "preview"], `
Changes in **Online Store ▸ Themes ▸ Customize** are a draft until you press **Save** (top right, or ⌘S / Ctrl+S) — the preview shows them straight away, your store only after you save.

- **Discard** throws away everything since you last saved.
- Moving to another page of the editor, or leaving it, with unsaved changes asks whether to save or discard them.
- The preview keeps its place while you edit, so you can watch the section you're changing.
`),
    a("connected-accounts", "apps", "Connect Google and Facebook once for all your apps", ["google", "facebook", "instagram", "connect", "sign in", "login", "account", "meta", "business profile", "token"], `
Your store signs in with Google and with Facebook **once**. Every app that needs them uses that sign-in — you're never asked to connect again, and you never copy keys or tokens.

- **Settings ▸ Connected accounts** shows both, who they're signed in as and what each app may use. Disconnect there any time.
- **Google** is used by Google Reviews (your Business Profile's reviews) and Google & YouTube (your products in Merchant Center). Install either and sign in; install the other later and you only pick your business or Merchant Center account.
- **Facebook** is used by Instagram Feed (the Instagram linked to your Facebook Page), Facebook & Instagram (your catalogue), Facebook Pixel, Meta Ads and WhatsApp. One "Continue with Facebook", then each app just asks which page, catalogue or pixel.
- If you unticked something on Google's or Facebook's screen, the app says so — sign in again and allow it.
`),
    a("oyklane-account", "orders", "Your shoppers' Oyklane account", ["shopper login", "customer account", "sign in", "one login", "oyklane account", "auto login"], `
A shopper who signs in on any Oyklane store with an emailed code, Google or their phone has an **Oyklane account** in that browser.

- On your store they're signed in to their account here automatically — on any page if they already have one with you.
- If they don't have one yet, it's made for them the moment they open **their account**, **sign in** or **checkout** on your store — so you get their details only when they choose to shop with you.
- They see a note saying they were signed in with their Oyklane account, with Sign out right there. Signing out on any store signs them out of the Oyklane account in that browser.
`),
  ],
};

// Articles whose text changed after they were first added: brought up to
// date (never re-added if the team deleted them) along with that batch.
const REVISED = {
  "help-articles-2026-10-02b": ["theme-templates", "sell-on-google", "sell-on-facebook-instagram"],
};

/** Adds each batch of newer articles once (production only — local
 * development shares the database and may run ahead of what's deployed). */
async function addNewArticles(prisma, { log, enabled = true } = {}) {
  if (!enabled) return 0;
  let added = 0;
  for (const [key, list] of Object.entries(ADDED)) {
    if (await prisma.platformSetting.findUnique({ where: { key } })) continue;
    const base = await prisma.supportArticle.count();
    const res = await prisma.supportArticle.createMany({ data: list.map((x, i) => ({ ...x, sortOrder: base + i, published: true })), skipDuplicates: true });
    const latest = Object.values(ADDED).flat();
    for (const slug of REVISED[key] || []) {
      const x = latest.find((y) => y.slug === slug);
      if (x) await prisma.supportArticle.updateMany({ where: { slug }, data: { title: x.title, body: x.body, keywords: x.keywords } });
    }
    await prisma.platformSetting.create({ data: { key, value: { added: res.count, at: new Date().toISOString() } } });
    added += res.count;
  }
  if (added) log?.info({ articles: added }, "support: new help articles added");
  return added;
}

async function seedArticles(prisma, { log } = {}) {
  const count = await prisma.supportArticle.count();
  if (count > 0) return 0;
  await prisma.supportArticle.createMany({
    data: SEED.map((x, i) => ({ ...x, sortOrder: i, published: true })),
    skipDuplicates: true,
  });
  log?.info({ articles: SEED.length }, "support: help articles added");
  return SEED.length;
}

// ── Search ────────────────────────────────────────────────────────────
const STOP = new Set("a an and are as at be but by can do does for from how i if in is it its me my of on or our so that the this to was we what when where which who why will with you your yours".split(" "));

const tokens = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

// Words that say what someone wants to do, not what it's about — "connect
// my domain" is about domains, not payment gateways.
const WEAK = new Set("connect add set setup change use create make show see get find work working turn start need want help".split(" "));

/** Ranks published articles for a question: title and keywords count most,
 * the body a little. Small enough (dozens of articles) to do in memory.
 * Articles far behind the best match are dropped. */
function rank(articles, query, limit = 5) {
  const words = tokens(query);
  if (!words.length) return [];
  const phrase = String(query).toLowerCase();
  const scored = articles
    .map((art) => {
      const title = tokens(art.title);
      const keys = (art.keywords || []).map((k) => k.toLowerCase());
      const body = String(art.body).toLowerCase();
      let score = 0;
      for (const w of words) {
        const weight = WEAK.has(w) ? 1 : 4;
        if (title.some((t) => t === w || (w.length > 3 && t.startsWith(w.slice(0, -1))))) score += weight;
        if (keys.some((k) => k === w || k.split(" ").includes(w) || (w.length > 3 && k.startsWith(w)))) score += weight;
        if (body.includes(w)) score += 1;
      }
      for (const k of keys) if (k.includes(" ") && phrase.includes(k)) score += 5;
      return { art, score };
    })
    .filter((x) => x.score >= 4)
    .sort((x, y) => y.score - x.score || x.art.sortOrder - y.art.sortOrder);
  const best = scored[0]?.score || 0;
  return scored
    .filter((x) => x.score >= best * 0.45)
    .slice(0, limit)
    .map((x) => x.art);
}

async function search(prisma, query, limit = 5) {
  const articles = await prisma.supportArticle.findMany({ where: { published: true } });
  return rank(articles, query, limit);
}

module.exports = { CATEGORIES, SEED, ADDED, seedArticles, addNewArticles, rank, search, tokens };
