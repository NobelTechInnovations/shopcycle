/**
 * The Oyklane Store's demo store (MARKET_DEMO_STORE, default "demo"):
 * where every theme's "View live demo" renders, with sample products and
 * collections. No owner and no subscription, so it never locks or bills.
 *
 *   node --env-file=../../.env scripts/seed-demo-store.js
 *
 * Safe to run again — it only adds what's missing.
 */
const { prisma } = require("@shopcycle/database");
const themes = require("../src/modules/themes/service");
const { env } = require("../src/config/env");

const HANDLE = env.MARKET_DEMO_STORE;
const COLLECTIONS = [
  { slug: "new-arrivals", title: "New arrivals", description: "Fresh in this week." },
  { slug: "bestsellers", title: "Bestsellers", description: "What everyone is buying." },
  { slug: "gifting", title: "Gifting", description: "Thoughtful gifts under ₹1,999." },
];
const PRODUCTS = [
  ["Everyday Cotton Kurta", 1299, 1599, "Apparel", ["new-arrivals", "bestsellers"]],
  ["Handwoven Linen Shirt", 1899, 2299, "Apparel", ["new-arrivals"]],
  ["Leather Tote Bag", 2499, 2999, "Bags", ["bestsellers", "gifting"]],
  ["Ceramic Coffee Mug", 449, 599, "Home", ["gifting"]],
  ["Mint Lemon Soda (6 pack)", 299, 360, "Drinks", ["new-arrivals", "bestsellers"]],
  ["Cold-Pressed Face Oil", 899, 1099, "Beauty", ["bestsellers", "gifting"]],
  ["Brass Diya Set", 699, null, "Home", ["gifting"]],
  ["Organic Turmeric Powder", 249, 299, "Pantry", ["new-arrivals"]],
];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

(async () => {
  let store = await prisma.store.findUnique({ where: { handle: HANDLE } });
  if (!store) store = await prisma.store.create({ data: { name: "Oyklane Demo", handle: HANDLE, settings: { demo: true } } });
  if (!(await prisma.theme.count({ where: { storeId: store.id } }))) await themes.installTheme(prisma, store.id, "classic");
  const cols = {};
  for (const c of COLLECTIONS) {
    cols[c.slug] = await prisma.collection.upsert({ where: { storeId_slug: { storeId: store.id, slug: c.slug } }, update: {}, create: { ...c, storeId: store.id, status: "active" } });
  }
  for (const [title, price, compare, type, inCols] of PRODUCTS) {
    const s = slug(title);
    if (await prisma.product.findUnique({ where: { storeId_slug: { storeId: store.id, slug: s } } })) continue;
    await prisma.product.create({
      data: {
        storeId: store.id,
        title,
        slug: s,
        status: "active",
        productType: type,
        vendor: "Oyklane Demo",
        description: `<p>${title} — a sample product on Oyklane's demo store, so you can see how this theme shows real products, prices and offers.</p>`,
        variants: { create: [{ title: "Default", price, comparePrice: compare, inventoryQuantity: 50 }] },
        collectionProducts: { create: inCols.map((k, position) => ({ collectionId: cols[k].id, position })) },
      },
    });
  }
  console.log(`demo store ready: ${HANDLE}`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e.message);
  await prisma.$disconnect();
  process.exit(1);
});
