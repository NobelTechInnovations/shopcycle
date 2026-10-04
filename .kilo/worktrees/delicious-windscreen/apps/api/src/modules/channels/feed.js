const crypto = require("crypto");
const { env } = require("../../config/env");
const { storefrontUrl } = require("../../lib/storefront-url");

/**
 * Product feeds for the sales channels: every active product, one item per
 * variant, in the formats Google Merchant Center (RSS 2.0 with g:
 * attributes) and Meta Commerce Manager (CSV) read on a schedule. The feed
 * URL carries a secret token, so only someone given it can read it; the
 * channel apps set Google and Meta up to fetch it by themselves.
 *
 * Left out: drafts, products the seller hid from the channel, products
 * without a photo or a price, and rented products (they have no single
 * price to list). Each reason is reported to the seller.
 */

const CHANNELS = { google: "google", facebook: "facebook" };
const LIMIT = 5000;

/** The secret in a store's feed URLs (stable, derived from the server secret). */
function feedToken(storeId) {
  return crypto.createHmac("sha256", `${env.JWT_SECRET}:feeds`).update(String(storeId)).digest("hex").slice(0, 32);
}

function feedUrls(store) {
  const base = `${env.API_PUBLIC_URL.replace(/\/$/, "")}/api/public/feeds/${store.id}/${feedToken(store.id)}`;
  return { google: `${base}/google.xml`, facebook: `${base}/facebook.csv` };
}

function validToken(storeId, token) {
  const want = Buffer.from(feedToken(storeId));
  const got = Buffer.from(String(token || ""));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

/** Plain text from a description that may hold HTML. */
function plain(html) {
  return String(html || "")
    .replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const money = (n, currency) => `${Number(n).toFixed(2)} ${currency}`;
const SIZE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl|free ?size|\d{1,3})$/i;
const COLOUR = /^(black|white|red|blue|green|yellow|pink|purple|orange|brown|grey|gray|beige|cream|navy|maroon|olive|teal|gold|silver|ivory|mustard|peach|lavender|indigo|rust|wine|multi(colou?r)?)$/i;

/** Size and colour from a variant title like "M / Black". */
function variantAttrs(title) {
  const out = {};
  for (const part of String(title || "").split(" / ").map((p) => p.trim())) {
    if (!out.size && SIZE.test(part)) out.size = part.toUpperCase();
    else if (!out.color && COLOUR.test(part)) out.color = part;
  }
  return out;
}

const PRODUCT_INCLUDE = {
  variants: { where: { status: "active" }, orderBy: { createdAt: "asc" } },
  images: { orderBy: { position: "asc" }, take: 11 },
  brand: { select: { title: true } },
  category: { select: { title: true } },
  rental: { select: { enabled: true } },
};

/**
 * The items for a channel, and why some products are left out:
 * { items, skipped: [{ id, title, reasons }], listed, total }.
 */
async function buildItems(prisma, store, channel) {
  const products = await prisma.product.findMany({ where: { storeId: store.id, status: "active" }, include: PRODUCT_INCLUDE, orderBy: { createdAt: "desc" }, take: LIMIT });
  const currency = store.currency || "INR";
  const items = [];
  const skipped = [];
  for (const p of products) {
    const reasons = [];
    if ((p.hiddenChannels || []).includes(channel)) reasons.push("Hidden from this channel");
    if (p.rental?.enabled) reasons.push("Rented out by the day");
    const images = p.images.map((i) => i.url).filter((u) => /^https:\/\//.test(u));
    if (!images.length) reasons.push("No photo");
    if (!p.variants.some((v) => Number(v.price) > 0)) reasons.push("No price");
    if (reasons.length) {
      skipped.push({ id: p.id, title: p.title, reasons, warning: false });
      continue;
    }
    const description = plain(p.description || p.seoDescription || p.title).slice(0, 4900);
    const brand = p.brand?.title || p.vendor || store.name;
    const many = p.variants.length > 1;
    const notes = [];
    if (plain(p.description).length < 30) notes.push("Add a longer description");
    if (channel === "google" && !p.googleCategory) notes.push("Choose a Google category");
    if (notes.length) skipped.push({ id: p.id, title: p.title, reasons: notes, warning: true });
    for (const v of p.variants) {
      const price = Number(v.price);
      if (!(price > 0)) continue;
      const compare = v.comparePrice ? Number(v.comparePrice) : null;
      const onSale = compare && compare > price;
      const title = `${p.title}${many && v.title !== "Default" ? ` – ${v.title}` : ""}`.slice(0, 150);
      items.push({
        // The variant's id: stable even when the seller changes the SKU.
        id: v.id,
        groupId: many ? p.id : null,
        title,
        description,
        link: storefrontUrl(store, `/products/${p.slug}${many ? `?variant=${v.id}` : ""}`),
        image: images[0],
        moreImages: images.slice(1, 10),
        inStock: v.inventoryQuantity > 0,
        quantity: Math.max(0, v.inventoryQuantity),
        price: money(onSale ? compare : price, currency),
        salePrice: onSale ? money(price, currency) : null,
        priceValue: onSale ? compare : price,
        salePriceValue: onSale ? price : null,
        currency,
        brand,
        mpn: v.sku || null,
        googleCategory: p.googleCategory || null,
        productType: [p.category?.title, p.productType].filter(Boolean).join(" > ") || null,
        ...variantAttrs(v.title),
      });
    }
  }
  return { items, skipped, listed: products.length - skipped.filter((s) => !s.warning).length, total: products.length };
}

const xml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** Google Merchant Center product feed (RSS 2.0). */
function googleXml(store, items) {
  const tag = (name, value) => (value == null || value === "" ? "" : `<g:${name}>${xml(value)}</g:${name}>`);
  const rows = items.map(
    (i) =>
      `<item>${tag("id", i.id)}<title>${xml(i.title)}</title><description>${xml(i.description)}</description><link>${xml(i.link)}</link>` +
      `${tag("image_link", i.image)}${i.moreImages.map((u) => tag("additional_image_link", u)).join("")}` +
      `${tag("availability", i.inStock ? "in_stock" : "out_of_stock")}${tag("price", i.price)}${tag("sale_price", i.salePrice)}` +
      `${tag("condition", "new")}${tag("brand", i.brand)}${tag("mpn", i.mpn)}${i.mpn ? "" : tag("identifier_exists", "no")}` +
      `${tag("item_group_id", i.groupId)}${tag("google_product_category", i.googleCategory)}${tag("product_type", i.productType)}` +
      `${tag("size", i.size)}${tag("color", i.color)}</item>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${xml(store.name)}</title><link>${xml(storefrontUrl(store, "/"))}</link><description>${xml(`Products from ${store.name}`)}</description>\n${rows.join("\n")}\n</channel></rss>\n`;
}

/** Meta (Facebook & Instagram) catalog data feed (CSV). */
function facebookCsv(items) {
  const cols = ["id", "title", "description", "availability", "condition", "price", "sale_price", "link", "image_link", "additional_image_link", "brand", "item_group_id", "google_product_category", "product_type", "size", "color", "quantity_to_sell_on_facebook"];
  const cell = (v) => {
    const s = String(v ?? "").replace(/\r?\n/g, " ");
    return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = items.map((i) =>
    [i.id, i.title, i.description, i.inStock ? "in stock" : "out of stock", "new", i.price, i.salePrice, i.link, i.image, i.moreImages.join(","), i.brand, i.groupId, i.googleCategory, i.productType, i.size, i.color, i.quantity]
      .map(cell)
      .join(",")
  );
  return `${cols.join(",")}\n${rows.join("\n")}\n`;
}

/** Counts for the channel pages: listed products and what needs attention. */
async function summary(prisma, store, channel) {
  const { items, skipped, listed, total } = await buildItems(prisma, store, channel);
  return {
    total,
    listed,
    items: items.length,
    problems: skipped.filter((s) => !s.warning).slice(0, 100),
    suggestions: skipped.filter((s) => s.warning).slice(0, 100),
    feedUrl: feedUrls(store)[channel],
  };
}

module.exports = { CHANNELS, feedToken, feedUrls, validToken, buildItems, googleXml, facebookCsv, summary, plain, variantAttrs };
