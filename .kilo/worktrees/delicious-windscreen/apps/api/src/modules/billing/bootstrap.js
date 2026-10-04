const { env } = require("../../config/env");
const { FEATURES, PLANS, LEGACY_FLAGS } = require("./catalog");
const { DEFAULTS, getSettings } = require("./settings");
const { addDays } = require("./pricing");
const subscriptions = require("./subscriptions");

/**
 * Brings the database up to what the billing engine expects. Runs at API
 * start and from the seed script; every step only fills in what's
 * missing, so it never overrides what the super admin has edited.
 *
 *   features & plans   Starter ₹199 · Growth ₹599 · Pro ₹1,299 (the old
 *                      Starter and Premium rows become Starter and Pro,
 *                      so stores keep their plan)
 *   settings           the billing defaults (settings.js)
 *   apps               One-Click Checkout in the app catalog
 *   stores             any store without a subscription starts a trial
 */
const LEGACY_NAMES = { starter: ["Starter"], growth: ["Growth"], pro: ["Premium", "Pro"] };

function legacyFlags(featureKeys) {
  const on = new Set(featureKeys);
  const flags = {};
  for (const [flag, key] of Object.entries(LEGACY_FLAGS)) flags[flag] = on.has(key);
  flags.prioritySupport = on.has("priority_support");
  return flags;
}

const ONE_CLICK = {
  key: "one-click-checkout",
  name: "One-Click Checkout",
  description:
    "Shoppers check out from the cart drawer in a quick popup — mobile number, a one-time code, then their saved addresses and your payment options. Adds a small fee per order paid through it.",
  category: "checkout",
  iconKey: "credit-card",
  settingsSchema: [],
};

// A paid app: the price is billed for every billing period it's installed
// in (billing/app-charges.js). Created once; the super admin edits the price.
const PHONE_LOGIN = {
  key: "phone-login",
  name: "Phone Login",
  description:
    "Shoppers sign in with their mobile number and a one-time code by SMS or WhatsApp — no password or email needed. ₹299/month (+GST), added to your next bill.",
  category: "customers",
  iconKey: "smartphone",
  priceMonthly: 299,
  settingsSchema: [
    {
      id: "channel",
      label: "Send sign-in codes by",
      type: "select",
      options: [
        { value: "sms", label: "SMS" },
        { value: "whatsapp", label: "WhatsApp" },
        { value: "both", label: "SMS or WhatsApp (shopper chooses)" },
      ],
    },
  ],
};

// Email automations (modules/flows). Free unless the super admin prices it.
const FLOW = {
  key: "flow",
  name: "Flow",
  description:
    "Automate emails to your customers: thank first-time buyers, ask for reviews after delivery, win back quiet customers, follow up abandoned checkouts — or build your own from triggers, waits and conditions.",
  category: "automation",
  iconKey: "workflow",
  settingsSchema: [],
};

// Social apps (modules/social): free. Each has its own page in the admin
// and a section sellers add in the theme editor.
const INSTAGRAM_FEED = {
  key: "instagram-feed",
  name: "Instagram Feed",
  description:
    "Show your latest Instagram posts on your store — a scrolling row or a grid you add anywhere in Customize. Connect once; new posts appear by themselves.",
  category: "marketing",
  iconKey: "megaphone",
  settingsSchema: [],
};

const GOOGLE_REVIEWS = {
  key: "google-reviews",
  name: "Google Reviews",
  description:
    "Show your Google rating and your best Google reviews on your store, with a link to write one. Find your business once; reviews refresh every day.",
  category: "marketing",
  iconKey: "star",
  settingsSchema: [
    {
      id: "minRating",
      label: "Show reviews with at least",
      type: "select",
      options: [
        { value: "5", label: "5 stars" },
        { value: "4", label: "4 stars" },
        { value: "3", label: "3 stars" },
        { value: "1", label: "Any rating" },
      ],
    },
  ],
};

// Rentals (modules/rentals): rent products out by the day. Free unless the
// super admin prices it.
const RENTALS = {
  key: "rentals",
  name: "Rentals",
  description:
    "Rent products out by the day — outfits, jewellery, cameras, décor. Shoppers pick dates on a calendar that greys out booked days; you set the daily rent, cheaper rates for longer rentals, a refundable deposit, delivery or pickup. Track every booking: what goes out today, what comes back, late returns and deposits.",
  category: "selling",
  iconKey: "calendar",
  settingsSchema: [],
};

// Sales channels (modules/channels): list the store's products on Google
// (Shopping, Search, YouTube, Maps) and Facebook & Instagram.
const GOOGLE_SHOPPING = {
  key: "google-shopping",
  name: "Google & YouTube",
  description:
    "List your products on Google for free — Shopping, Search, Images, YouTube and Maps — through Google Merchant Center. Connect your Google account once; prices, stock and new products stay in sync by themselves.",
  category: "sales_channel",
  iconKey: "store",
  settingsSchema: [],
};

const FACEBOOK_SHOP = {
  key: "facebook-shop",
  name: "Facebook & Instagram",
  description:
    "Your product catalog on Facebook and Instagram — tag products in posts and reels, run catalog ads, and show a shop on your Page and profile. Connect with Facebook once; products stay in sync by themselves.",
  category: "sales_channel",
  iconKey: "store",
  settingsSchema: [],
};

async function seedCatalog(prisma, { log } = {}) {
  const have = new Set((await prisma.feature.findMany({ select: { key: true } })).map((f) => f.key));
  const missing = FEATURES.filter((f) => !have.has(f.key));
  if (missing.length) {
    await prisma.feature.createMany({
      data: missing.map((f) => ({ key: f.key, name: f.name, category: f.category, kind: f.kind || "boolean", sortOrder: f.sortOrder })),
      skipDuplicates: true,
    });
  }

  for (const def of PLANS) {
    let plan = await prisma.plan.findUnique({ where: { key: def.key } });
    if (!plan) {
      const data = {
        key: def.key,
        name: def.name,
        priceMonthly: def.priceMonthly,
        commissionPercent: def.commissionPercent,
        staffLimit: def.staffLimit,
        productLimit: null,
        sortOrder: def.sortOrder,
        tagline: def.tagline,
        description: def.tagline,
        isActive: true,
        razorpayPlanId: null,
        ...legacyFlags(def.features),
      };
      const legacy = await prisma.plan.findFirst({ where: { key: null, name: { in: LEGACY_NAMES[def.key] } } });
      plan = legacy ? await prisma.plan.update({ where: { id: legacy.id }, data }) : await prisma.plan.create({ data });
      log?.info({ plan: def.key, from: legacy?.name || null }, "billing: plan set up");
    }
    const rows = await prisma.planFeature.findMany({ where: { planId: plan.id }, select: { featureKey: true } });
    const done = new Set(rows.map((r) => r.featureKey));
    const add = FEATURES.filter((f) => !done.has(f.key)).map((f) => ({
      planId: plan.id,
      featureKey: f.key,
      enabled: f.key === "staff" ? true : def.features.includes(f.key),
      limitValue: f.key === "staff" ? def.staffLimit : null,
    }));
    if (add.length) await prisma.planFeature.createMany({ data: add, skipDuplicates: true });
  }
  // Older fixture plans stay for history but aren't offered any more.
  await prisma.plan.updateMany({ where: { key: null, isActive: true }, data: { isActive: false } });

  await prisma.platformSetting.upsert({ where: { key: "billing" }, update: {}, create: { key: "billing", value: DEFAULTS } });
  await prisma.app.upsert({ where: { key: ONE_CLICK.key }, update: {}, create: ONE_CLICK });
  await prisma.app.upsert({ where: { key: PHONE_LOGIN.key }, update: {}, create: PHONE_LOGIN });
  await prisma.app.upsert({ where: { key: FLOW.key }, update: {}, create: FLOW });
  // Local dev shares production's database: a local start would list these
  // in production's app store before production can run them.
  if (env.NODE_ENV === "production" || env.SEED_PREVIEW_APPS === "1") {
    await prisma.app.upsert({ where: { key: INSTAGRAM_FEED.key }, update: {}, create: INSTAGRAM_FEED });
    await prisma.app.upsert({ where: { key: GOOGLE_REVIEWS.key }, update: {}, create: GOOGLE_REVIEWS });
    await prisma.app.upsert({ where: { key: RENTALS.key }, update: {}, create: RENTALS });
    await prisma.app.upsert({ where: { key: GOOGLE_SHOPPING.key }, update: {}, create: GOOGLE_SHOPPING });
    await prisma.app.upsert({ where: { key: FACEBOOK_SHOP.key }, update: {}, create: FACEBOOK_SHOP });
  }
  await require("../support/articles").seedArticles(prisma, { log });
  await require("../support/articles").addNewArticles(prisma, { log, enabled: env.NODE_ENV === "production" || env.SEED_PREVIEW_APPS === "1" });
}

/** A trial for every store that has no subscription yet. A store already
 * in an older (longer) trial keeps its end date. */
async function migrateStores(prisma, { log, now = new Date() } = {}) {
  const stores = await prisma.store.findMany({
    where: { subscription: null },
    select: { id: true, name: true, planId: true, subscriptionStatus: true, trialEndsAt: true },
    take: 1000,
  });
  if (!stores.length) return 0;
  const settings = await getSettings(prisma, { fresh: true });
  const plans = await prisma.plan.findMany({ where: { key: { not: null }, isActive: true }, select: { id: true } });
  const base = addDays(now, settings.trialDays);
  let created = 0;
  for (const s of stores) {
    const keep = s.planId && plans.some((p) => p.id === s.planId) ? s.planId : null;
    const trialEndsAt = s.subscriptionStatus === "trialing" && s.trialEndsAt && new Date(s.trialEndsAt) > base ? s.trialEndsAt : base;
    const sub = await subscriptions.createForStore(prisma, s, { now, trialEndsAt, planId: keep });
    if (sub) created += 1;
  }
  log?.info({ created }, "billing: trials started for existing stores");
  return created;
}

async function bootstrap(prisma, { log } = {}) {
  await seedCatalog(prisma, { log });
  await migrateStores(prisma, { log });
}

module.exports = { bootstrap, seedCatalog, migrateStores, ONE_CLICK, PHONE_LOGIN, FLOW };
