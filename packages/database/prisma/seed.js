/**
 * Optional dev convenience seed — NOT the theme installer (that lives in
 * apps/api/src/modules/themes, since installing a theme for a real store is
 * a product feature, not a fixture). This just gives you something to look
 * at in the admin without registering + clicking through forms by hand.
 */
const { prisma } = require("../src/client");
const bcrypt = require("bcryptjs");

async function main() {
  // Billing plans (Phase 9) — exactly two, seeded fixtures, not
  // merchant-created. The old 3-tier Free/Starter/Growth lineup is
  // retired: every store on one of those has its planId nulled out
  // (Store.plan's onDelete: SetNull) and lands back in the no_plan
  // billing state, same as a brand-new store — correct, since "no real
  // plan chosen yet" is exactly what those old fixture plans were.
  await prisma.plan.deleteMany({ where: { name: { in: ["Free", "Growth"] } } });
  await prisma.plan.upsert({
    where: { name: "Starter" },
    update: {
      priceMonthly: "999.00",
      productLimit: 1000,
      staffLimit: 5,
      description: "Full store access, pay-as-you-grow on ads and paid apps.",
      commissionPercent: "2.50",
      hasGstSoftware: false,
      hasAdsManagerIncluded: false,
      hasMetaAds: false,
      paidAppsIncluded: false,
      premiumThemesIncluded: false,
      hasWhatsappIntegration: false,
      hasSocialMediaManager: false,
      prioritySupport: false,
      cartCustomizable: false,
      hasApiAccess: false,
      hasCsvExport: false,
    },
    create: {
      name: "Starter",
      priceMonthly: "999.00",
      productLimit: 1000,
      staffLimit: 5,
      description: "Full store access, pay-as-you-grow on ads and paid apps.",
      commissionPercent: "2.50",
    },
  });
  await prisma.plan.upsert({
    where: { name: "Premium" },
    update: {
      priceMonthly: "2299.00",
      productLimit: 100000,
      staffLimit: 25,
      description: "Everything included — ads, apps, themes, GST, and priority support.",
      commissionPercent: "1.50",
      hasGstSoftware: true,
      hasAdsManagerIncluded: true,
      hasMetaAds: true,
      paidAppsIncluded: true,
      premiumThemesIncluded: true,
      hasWhatsappIntegration: true,
      hasSocialMediaManager: true,
      prioritySupport: true,
      cartCustomizable: true,
      hasApiAccess: true,
      hasCsvExport: true,
    },
    create: {
      name: "Premium",
      priceMonthly: "2299.00",
      productLimit: 100000,
      staffLimit: 25,
      description: "Everything included — ads, apps, themes, GST, and priority support.",
      commissionPercent: "1.50",
      hasGstSoftware: true,
      hasAdsManagerIncluded: true,
      hasMetaAds: true,
      paidAppsIncluded: true,
      premiumThemesIncluded: true,
      hasWhatsappIntegration: true,
      hasSocialMediaManager: true,
      prioritySupport: true,
      cartCustomizable: true,
      hasApiAccess: true,
      hasCsvExport: true,
    },
  });

  // App catalog (Phase 8) — seeded fixtures a super admin manages from
  // /admin/super-admin/apps, not something a merchant creates. Each
  // settingsSchema entry is what the install form renders generically —
  // adding a new field to an app is a data change, not a UI change.
  await prisma.app.upsert({
    where: { key: "google-analytics" },
    update: { iconKey: "bar-chart" },
    create: {
      key: "google-analytics",
      name: "Google Analytics",
      description: "Adds the gtag.js snippet to every storefront page using your Measurement ID.",
      category: "analytics",
      iconKey: "bar-chart",
      settingsSchema: [{ id: "measurementId", label: "Measurement ID", type: "text", placeholder: "G-XXXXXXXXXX" }],
    },
  });
  await prisma.app.upsert({
    where: { key: "facebook-pixel" },
    update: { iconKey: "activity" },
    create: {
      key: "facebook-pixel",
      name: "Facebook Pixel",
      description: "Adds the Meta Pixel base code to every storefront page using your Pixel ID.",
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
  await prisma.app.upsert({
    where: { key: "customer-reviews" },
    update: { iconKey: "star" },
    create: {
      key: "customer-reviews",
      name: "Customer Reviews",
      description:
        "A simple review widget for your storefront — add every review here once; it shows wherever the Customer Reviews section is placed in your theme, on every page, no theme editing needed per review.",
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

  console.log("Seeded:", { user: user.email, store: store.handle });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
