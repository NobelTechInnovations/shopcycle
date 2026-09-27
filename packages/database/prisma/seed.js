/**
 * Optional dev convenience seed — gives you something to look at in the
 * admin without registering + clicking through forms by hand. Theme
 * installation is delegated to the API's real installer (the same code a
 * merchant's "Install theme" click runs) rather than copied here, so the
 * demo store always gets exactly what a real store would.
 */
const { prisma } = require("../src/client");
const bcrypt = require("bcryptjs");
const themesService = require("../../../apps/api/src/modules/themes/service");
const { seedCatalog } = require("../../../apps/api/src/modules/billing/bootstrap");

async function main() {
  // Billing catalog — Starter / Growth / Pro, their features, the billing
  // settings and the One-Click Checkout app. The API does the same at
  // start-up (modules/billing/bootstrap.js); it only fills in what's
  // missing, so running the seed never undoes the super admin's edits.
  await seedCatalog(prisma);

  const GA_DESCRIPTION =
    "Google Analytics 4 on every page, checkout included — with product views, add to cart, checkout and purchase events.";
  const PIXEL_DESCRIPTION =
    "Meta Pixel on every page, checkout included — ViewContent, AddToCart, InitiateCheckout and Purchase, so your ads learn from real sales.";
  const PRODUCT_REVIEWS_DESCRIPTION =
    "Star ratings on product pages and cards, a review form for shoppers, verified-buyer badges, moderation and CSV import.";
  const TESTIMONIALS_DESCRIPTION =
    "Quotes from happy customers for your home page — add them once here; they show wherever a Testimonials section is placed.";
  // App catalog (Phase 8) — seeded fixtures a super admin manages from
  // /admin/super-admin/apps, not something a merchant creates. Each
  // settingsSchema entry is what the install form renders generically —
  // adding a new field to an app is a data change, not a UI change.
  await prisma.app.upsert({
    where: { key: "google-analytics" },
    update: { iconKey: "bar-chart", description: GA_DESCRIPTION },
    create: {
      key: "google-analytics",
      name: "Google Analytics",
      description: GA_DESCRIPTION,
      category: "analytics",
      iconKey: "bar-chart",
      settingsSchema: [{ id: "measurementId", label: "Measurement ID", type: "text", placeholder: "G-XXXXXXXXXX" }],
    },
  });
  await prisma.app.upsert({
    where: { key: "facebook-pixel" },
    update: { iconKey: "activity", description: PIXEL_DESCRIPTION },
    create: {
      key: "facebook-pixel",
      name: "Facebook Pixel",
      description: PIXEL_DESCRIPTION,
      category: "analytics",
      iconKey: "activity",
      settingsSchema: [{ id: "pixelId", label: "Pixel ID", type: "text", placeholder: "123456789012345" }],
    },
  });
  await prisma.app.upsert({
    where: { key: "custom-scripts" },
    update: { iconKey: "code" },
    create: {
      key: "custom-scripts",
      name: "Custom Scripts",
      description: "Injects your own HTML/JS snippet just before </head> on every storefront page.",
      category: "utility",
      iconKey: "code",
      settingsSchema: [{ id: "headHtml", label: "Head HTML/JS", type: "textarea", placeholder: "<script>...</script>" }],
    },
  });
  // Real per-product reviews — a dedicated panel (Apps ▸ Product Reviews),
  // so no install form; see apps/api/src/modules/reviews.
  await prisma.app.upsert({
    where: { key: "product-reviews" },
    update: { name: "Product Reviews", iconKey: "star", description: PRODUCT_REVIEWS_DESCRIPTION },
    create: {
      key: "product-reviews",
      name: "Product Reviews",
      description: PRODUCT_REVIEWS_DESCRIPTION,
      category: "marketing",
      iconKey: "star",
      settingsSchema: [],
    },
  });
  await prisma.app.upsert({
    where: { key: "customer-reviews" },
    update: { iconKey: "quote", name: "Testimonials", description: TESTIMONIALS_DESCRIPTION },
    create: {
      key: "customer-reviews",
      name: "Testimonials",
      description: TESTIMONIALS_DESCRIPTION,
      category: "marketing",
      iconKey: "star",
      settingsSchema: [
        {
          id: "reviews",
          label: "Reviews",
          type: "repeater",
          itemLabel: "review",
          defaults: { rating: 5, verified: true },
          fields: [
            { id: "name", label: "Customer name", type: "text" },
            { id: "rating", label: "Rating", type: "select", options: [1, 2, 3, 4, 5] },
            { id: "quote", label: "Review text", type: "textarea" },
            { id: "verified", label: "Verified buyer", type: "checkbox" },
          ],
        },
      ],
    },
  });

  // Meta Ads and WhatsApp (Phase 10) — unlike the settings-form apps
  // above, these have their own dedicated panels (Connect screen, campaign
  // builder, message composer — see apps/admin/app/admin/apps/meta-ads and
  // .../whatsapp) rather than a generic install form, so settingsSchema is
  // left empty here; "installed" from this catalog is still exactly what
  // gates access to those panels (see apps/service.js#assertInstalled).
  await prisma.app.upsert({
    where: { key: "meta-ads" },
    update: { iconKey: "megaphone" },
    create: {
      key: "meta-ads",
      name: "Meta Ads",
      description: "Connect Facebook to manage your ad accounts and launch new campaigns without leaving your dashboard.",
      category: "marketing",
      iconKey: "megaphone",
      settingsSchema: [],
    },
  });
  await prisma.app.upsert({
    where: { key: "whatsapp" },
    update: { iconKey: "message-circle" },
    create: {
      key: "whatsapp",
      name: "WhatsApp",
      description: "Connect your WhatsApp Business number to message customers directly from your dashboard.",
      category: "marketing",
      iconKey: "message-circle",
      settingsSchema: [],
    },
  });

  const passwordHash = await bcrypt.hash("password123", 10);

  const user = await prisma.user.upsert({
    where: { email: "owner@shopcycle.test" },
    update: {},
    create: { name: "Demo Owner", email: "owner@shopcycle.test", passwordHash },
  });

  // Platform super admin — a separate account from any store owner, since
  // a real super admin usually isn't also running a store. Seeded, not
  // self-serve-promotable (see the isSuperAdmin doc comment in schema.prisma).
  const superAdminPasswordHash = await bcrypt.hash("superadmin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@shopcycle.platform" },
    update: { isSuperAdmin: true },
    create: {
      name: "Platform Admin",
      email: "admin@shopcycle.platform",
      passwordHash: superAdminPasswordHash,
      isSuperAdmin: true,
    },
  });

  const store = await prisma.store.upsert({
    where: { handle: "demo-store" },
    update: {},
    create: {
      name: "Demo Store",
      handle: "demo-store",
      currency: "INR",
      storeUsers: { create: { userId: user.id, role: "owner" } },
    },
  });

  const existing = await prisma.product.count({ where: { storeId: store.id } });
  if (existing === 0) {
    await prisma.product.create({
      data: {
        storeId: store.id,
        title: "Lakadong Turmeric",
        slug: "lakadong-turmeric",
        description: "Single-origin high-curcumin turmeric.",
        status: "active",
        productType: "Spices",
        variants: {
          create: [{ title: "250g", sku: "TUR-250", price: "299.00", inventoryQuantity: 120 }],
        },
      },
    });
  }

  // The store is created directly above (not via provisionStore) so it skips
  // the 2-day plan deadline a real signup gets — a dev fixture shouldn't
  // lock itself out of its own admin. That also skipped the theme install,
  // which left the demo storefront a 404; install both master themes here
  // instead (Classic goes live as the first install). Guarded so re-running
  // the seed never piles up duplicate theme copies.
  const themeCount = await prisma.theme.count({ where: { storeId: store.id } });
  if (themeCount === 0) {
    await themesService.installTheme(prisma, store.id, "classic");
    await themesService.installTheme(prisma, store.id, "modern");
  }

  console.log("Seeded:", { user: user.email, store: store.handle });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
