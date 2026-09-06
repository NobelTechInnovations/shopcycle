/**
 * Optional dev convenience seed — NOT the theme installer (that lives in
 * apps/api/src/modules/themes, since installing a theme for a real store is
 * a product feature, not a fixture). This just gives you something to look
 * at in the admin without registering + clicking through forms by hand.
 */
const { prisma } = require("../src/client");
const bcrypt = require("bcryptjs");

async function main() {
  // Billing plans (Phase 7) — seeded fixtures, not merchant-created.
  await prisma.plan.upsert({
    where: { name: "Free" },
    update: {},
    create: {
      name: "Free",
      priceMonthly: "0.00",
      productLimit: 10,
      staffLimit: 1,
      description: "Get started: up to 10 products, 1 staff account.",
    },
  });
  await prisma.plan.upsert({
    where: { name: "Starter" },
    update: {},
    create: {
      name: "Starter",
      priceMonthly: "999.00",
      productLimit: 200,
      staffLimit: 5,
      description: "For growing stores: up to 200 products, 5 staff accounts.",
    },
  });
  await prisma.plan.upsert({
    where: { name: "Growth" },
    update: {},
    create: {
      name: "Growth",
      priceMonthly: "2999.00",
      productLimit: 5000,
      staffLimit: 20,
      description: "For scaling stores: up to 5,000 products, 20 staff accounts, custom domain.",
    },
  });

  // App catalog (Phase 8) — seeded fixtures a super admin manages from
  // /admin/super-admin/apps, not something a merchant creates. Each
  // settingsSchema entry is what the install form renders generically —
  // adding a new field to an app is a data change, not a UI change.
  await prisma.app.upsert({
    where: { key: "google-analytics" },
    update: {},
    create: {
      key: "google-analytics",
      name: "Google Analytics",
      description: "Adds the gtag.js snippet to every storefront page using your Measurement ID.",
      category: "analytics",
      iconEmoji: "📈",
      settingsSchema: [{ id: "measurementId", label: "Measurement ID", type: "text", placeholder: "G-XXXXXXXXXX" }],
    },
  });
  await prisma.app.upsert({
    where: { key: "facebook-pixel" },
    update: {},
    create: {
      key: "facebook-pixel",
      name: "Facebook Pixel",
      description: "Adds the Meta Pixel base code to every storefront page using your Pixel ID.",
      category: "analytics",
      iconEmoji: "📊",
      settingsSchema: [{ id: "pixelId", label: "Pixel ID", type: "text", placeholder: "123456789012345" }],
    },
  });
  await prisma.app.upsert({
    where: { key: "custom-scripts" },
    update: {},
    create: {
      key: "custom-scripts",
      name: "Custom Scripts",
      description: "Injects your own HTML/JS snippet just before </head> on every storefront page.",
      category: "utility",
      iconEmoji: "🧩",
      settingsSchema: [{ id: "headHtml", label: "Head HTML/JS", type: "textarea", placeholder: "<script>...</script>" }],
    },
  });
  await prisma.app.upsert({
    where: { key: "customer-reviews" },
    update: {},
    create: {
      key: "customer-reviews",
      name: "Customer Reviews",
      description:
        "A simple review widget for your storefront — add every review here once; it shows wherever the Customer Reviews section is placed in your theme, on every page, no theme editing needed per review.",
      category: "marketing",
      iconEmoji: "⭐",
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

  console.log("Seeded:", { user: user.email, store: store.handle });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
