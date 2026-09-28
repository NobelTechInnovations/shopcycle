const { esc } = require("../../emails/templates");

/**
 * Store policies (Settings ▸ Policies): ordinary content pages at fixed
 * addresses — /pages/refund-policy and so on — so the storefront footer can
 * link them on every theme, and the seller edits them like any page. Each
 * starts from a plain template with the store's name and contact filled in;
 * it's a starting point for the seller to check, not legal advice.
 */
const POLICIES = [
  { key: "refund", title: "Refund policy", slug: "refund-policy", hint: "Returns, exchanges and refunds." },
  { key: "shipping", title: "Shipping policy", slug: "shipping-policy", hint: "Where you deliver, how long it takes, what it costs." },
  { key: "privacy", title: "Privacy policy", slug: "privacy-policy", hint: "What customer data you collect and why." },
  { key: "terms", title: "Terms of service", slug: "terms-of-service", hint: "The rules for buying from your store." },
];
const SLUGS = POLICIES.map((p) => p.slug);

function contactLine(store) {
  const email = store.supportEmail ? `<a href="mailto:${esc(store.supportEmail)}">${esc(store.supportEmail)}</a>` : null;
  const phone = store.supportPhone ? esc(store.supportPhone) : null;
  return [email, phone].filter(Boolean).join(" or ") || "the contact details on our website";
}

function template(key, store) {
  const name = esc(store.name);
  const contact = contactLine(store);
  switch (key) {
    case "refund":
      return `<p>We want you to love what you buy from ${name}. If something isn't right, here's how returns and refunds work.</p>
<h2>Returns</h2>
<p>You can ask to return an item within <strong>7 days</strong> of delivery. It must be unused, with its tags and original packaging. Items marked as final sale, innerwear and personalised products can't be returned.</p>
<p>To start a return, open your order from the link in your confirmation email and choose <em>Request a return</em>, or contact us at ${contact} with your order number.</p>
<h2>Damaged or wrong items</h2>
<p>If your order arrives damaged or you received the wrong item, tell us within 48 hours of delivery with a photo, and we'll replace it or refund you in full.</p>
<h2>Refunds</h2>
<p>Once we receive and check the returned item, we refund you within 5–7 working days — to your original payment method for online payments, or by bank transfer / UPI for cash-on-delivery orders. Shipping charges aren't refunded unless the return is due to our mistake.</p>
<h2>Exchanges</h2>
<p>Want a different size or colour? Ask for an exchange when you start your return, and we'll send the new item once the original reaches us, subject to stock.</p>`;
    case "shipping":
      return `<p>${name} ships across India.</p>
<h2>Processing time</h2>
<p>Orders are packed and handed to our courier within <strong>1–2 working days</strong>. You'll get an email with tracking details as soon as your order ships.</p>
<h2>Delivery time</h2>
<p>Most orders arrive within 3–7 working days, depending on your PIN code. Remote areas can take a little longer.</p>
<h2>Shipping charges</h2>
<p>Shipping charges, if any, are shown at checkout before you pay.</p>
<h2>Cash on delivery</h2>
<p>Where cash on delivery is available, it's shown at checkout. Please keep the exact amount ready when your order arrives.</p>
<h2>Questions</h2>
<p>For anything about your delivery, contact us at ${contact}.</p>`;
    case "privacy":
      return `<p>This policy explains how ${name} collects and uses your personal information when you visit or buy from our store.</p>
<h2>What we collect</h2>
<p>When you place an order or create an account we collect your name, email address, phone number, delivery address and order details. Payments are handled by our payment partners — we never see or store your full card or bank details.</p>
<h2>How we use it</h2>
<ul><li>To process, deliver and support your orders</li><li>To send order updates by email, SMS or WhatsApp</li><li>To send offers — only if you've agreed to receive them; you can unsubscribe any time</li><li>To keep our store secure and improve it</li></ul>
<h2>Sharing</h2>
<p>We share only what's needed with the partners who help us run the store — our e-commerce platform, payment gateways, couriers and messaging providers. We don't sell your personal information.</p>
<h2>Cookies</h2>
<p>We use cookies to keep your cart and sign-in working and, if enabled, to measure visits and ads.</p>
<h2>Your choices</h2>
<p>You can ask us to see, correct or delete your personal information by contacting us at ${contact}.</p>`;
    case "terms":
      return `<p>By using this website and buying from ${name} you agree to these terms.</p>
<h2>Orders</h2>
<p>An order is confirmed once you receive our confirmation email. We may cancel an order — and refund any payment — if a product is out of stock, a price was shown wrongly, or we suspect fraud.</p>
<h2>Prices and payment</h2>
<p>Prices are in Indian rupees and include applicable taxes unless shown otherwise. Shipping charges are shown at checkout.</p>
<h2>Products</h2>
<p>We try to show our products as accurately as possible; colours may look slightly different on your screen.</p>
<h2>Returns</h2>
<p>Returns and refunds follow our Refund policy.</p>
<h2>Liability</h2>
<p>To the extent the law allows, our liability for any order is limited to the amount you paid for it.</p>
<h2>Governing law</h2>
<p>These terms are governed by the laws of India.</p>
<h2>Contact</h2>
<p>Questions about these terms? Contact us at ${contact}.</p>`;
    default:
      return "";
  }
}

/** The four policies and, for each, the store's page if it has one. */
async function list(prisma, store) {
  const pages = await prisma.page.findMany({ where: { storeId: store.id, slug: { in: SLUGS } }, select: { id: true, slug: true, status: true, updatedAt: true } });
  return POLICIES.map((p) => ({ ...p, page: pages.find((pg) => pg.slug === p.slug) || null }));
}

/** Creates a policy page from its template — published, at its fixed address. */
async function create(prisma, store, key) {
  const policy = POLICIES.find((p) => p.key === key);
  if (!policy) return null;
  const existing = await prisma.page.findFirst({ where: { storeId: store.id, slug: policy.slug } });
  if (existing) return existing;
  return prisma.page.create({ data: { storeId: store.id, title: policy.title, slug: policy.slug, body: template(key, store), status: "active" } });
}

/** The published ones, for the storefront footer. */
function published(prisma, storeId) {
  return prisma.page.findMany({ where: { storeId, status: "active", slug: { in: SLUGS } }, select: { title: true, slug: true } }).then((pages) =>
    POLICIES.map((p) => pages.find((pg) => pg.slug === p.slug)).filter(Boolean)
  );
}

module.exports = { POLICIES, list, create, published };
