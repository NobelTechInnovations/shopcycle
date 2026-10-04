const { HttpError } = require("@shopcycle/utils");

/**
 * Product reviews — the "Product Reviews" app. Installed from Apps, it
 * turns on star ratings on product cards and pages, a review form under
 * each product, moderation in the admin and CSV import. Nothing here
 * shows on the store until the app is installed.
 */
const APP_KEY = "product-reviews";

const DEFAULTS = {
  // Who may write one: "anyone", or "buyers" (the email has ordered it).
  whoCanReview: "anyone",
  // Published straight away: "all", "verified" (buyers only), or "none".
  autoPublish: "verified",
  // Stars under product cards on collection pages and the home page.
  showOnCards: true,
};

/** The app's settings for this store, or null when it isn't installed. */
async function appSettings(prisma, storeId) {
  const install = await prisma.storeApp.findFirst({ where: { storeId, app: { key: APP_KEY } }, select: { settings: true } });
  if (!install) return null;
  const raw = install.settings && typeof install.settings === "object" ? install.settings : {};
  return { ...DEFAULTS, ...raw };
}

async function requireInstalled(prisma, storeId) {
  const settings = await appSettings(prisma, storeId);
  if (!settings) throw new HttpError(402, "Install the Product Reviews app first (Apps ▸ Product Reviews).", { appKey: APP_KEY });
  return settings;
}

const round1 = (n) => Math.round(n * 10) / 10;

/** { productId: { average, count } } for published reviews. */
async function summaries(prisma, storeId, productIds) {
  const rows = await prisma.productReview.groupBy({
    by: ["productId"],
    where: { storeId, status: "published", ...(productIds && { productId: { in: productIds } }) },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.productId, { average: round1(r._avg.rating || 0), count: r._count._all }]));
}

function publicReview(r) {
  return {
    id: r.id,
    rating: r.rating,
    title: r.title || "",
    body: r.body,
    author: r.authorName,
    verified: r.verified,
    date: r.createdAt,
    reply: r.reply || null,
  };
}

/** Everything the product page's reviews section shows. */
async function forProduct(prisma, storeId, productId, { limit = 30 } = {}) {
  const where = { storeId, productId, status: "published" };
  const [items, grouped] = await Promise.all([
    prisma.productReview.findMany({ where, orderBy: [{ createdAt: "desc" }], take: limit }),
    prisma.productReview.groupBy({ by: ["rating"], where, _count: { _all: true } }),
  ]);
  const byStar = Object.fromEntries(grouped.map((g) => [g.rating, g._count._all]));
  const count = grouped.reduce((n, g) => n + g._count._all, 0);
  const sum = grouped.reduce((n, g) => n + g.rating * g._count._all, 0);
  return {
    average: count ? round1(sum / count) : 0,
    count,
    histogram: [5, 4, 3, 2, 1].map((star) => ({ star, count: byStar[star] || 0, percent: count ? Math.round(((byStar[star] || 0) / count) * 100) : 0 })),
    items: items.map(publicReview),
  };
}

async function isVerifiedBuyer(prisma, storeId, productId, email) {
  if (!email) return false;
  const hit = await prisma.orderItem.findFirst({
    where: { productId, order: { storeId, cancelledAt: null, email: { equals: email, mode: "insensitive" } } },
    select: { id: true },
  });
  return Boolean(hit);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A review written on the product page. Returns its status. */
async function submit(prisma, store, slug, input) {
  const settings = await requireInstalled(prisma, store.id);
  const product = await prisma.product.findFirst({ where: { storeId: store.id, slug: String(slug || ""), status: "active" }, select: { id: true } });
  if (!product) throw new HttpError(404, "Product not found");

  const rating = Number(input.rating);
  const name = String(input.name || "").trim().slice(0, 80);
  const email = String(input.email || "").trim().toLowerCase().slice(0, 200);
  const title = String(input.title || "").trim().slice(0, 120);
  const body = String(input.body || "").trim().slice(0, 3000);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, "Choose a star rating.");
  if (!name) throw new HttpError(400, "Enter your name.");
  if (!EMAIL.test(email)) throw new HttpError(400, "Enter a valid email (it isn't shown).");
  if (body.length < 10) throw new HttpError(400, "Write a few words about the product (at least 10 characters).");

  const verified = await isVerifiedBuyer(prisma, store.id, product.id, email);
  if (settings.whoCanReview === "buyers" && !verified) {
    throw new HttpError(403, "Only customers who bought this product can review it. Use the email you ordered with.");
  }
  const existing = await prisma.productReview.findFirst({ where: { storeId: store.id, productId: product.id, authorEmail: email }, select: { id: true } });
  if (existing) throw new HttpError(409, "You've already reviewed this product — thank you!");

  const publish = settings.autoPublish === "all" || (settings.autoPublish === "verified" && verified);
  const review = await prisma.productReview.create({
    data: {
      storeId: store.id,
      productId: product.id,
      rating,
      title: title || null,
      body,
      authorName: name,
      authorEmail: email,
      verified,
      status: publish ? "published" : "pending",
      source: "storefront",
    },
  });
  return { status: review.status };
}

// ── Admin ──────────────────────────────────────────────────────────

const STATUSES = ["pending", "published", "hidden"];

async function list(prisma, storeId, { status, q, page = 1, pageSize = 25 } = {}) {
  const where = {
    storeId,
    ...(STATUSES.includes(status) && { status }),
    ...(q && {
      OR: [
        { body: { contains: q, mode: "insensitive" } },
        { authorName: { contains: q, mode: "insensitive" } },
        { product: { title: { contains: q, mode: "insensitive" } } },
      ],
    }),
  };
  const [reviews, total, counts] = await Promise.all([
    prisma.productReview.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { product: { select: { id: true, title: true, slug: true, images: { orderBy: { position: "asc" }, take: 1, select: { url: true } } } } },
    }),
    prisma.productReview.count({ where }),
    prisma.productReview.groupBy({ by: ["status"], where: { storeId }, _count: { _all: true } }),
  ]);
  const avg = await prisma.productReview.aggregate({ where: { storeId, status: "published" }, _avg: { rating: true } });
  return {
    reviews,
    total,
    page,
    pageSize,
    counts: Object.fromEntries(STATUSES.map((s) => [s, counts.find((c) => c.status === s)?._count._all || 0])),
    average: round1(avg._avg.rating || 0),
  };
}

async function update(prisma, storeId, id, input) {
  const review = await prisma.productReview.findFirst({ where: { id, storeId } });
  if (!review) throw new HttpError(404, "Review not found");
  const data = {};
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status)) throw new HttpError(400, "Unknown status");
    data.status = input.status;
  }
  if (input.reply !== undefined) {
    const reply = String(input.reply || "").trim().slice(0, 2000);
    data.reply = reply || null;
    data.repliedAt = reply ? new Date() : null;
  }
  return prisma.productReview.update({ where: { id }, data });
}

async function bulk(prisma, storeId, ids, action) {
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, "Select at least one review");
  if (action === "delete") return prisma.productReview.deleteMany({ where: { storeId, id: { in: ids } } });
  if (!STATUSES.includes(action)) throw new HttpError(400, "Unknown action");
  return prisma.productReview.updateMany({ where: { storeId, id: { in: ids } }, data: { status: action } });
}

async function remove(prisma, storeId, id) {
  const { count } = await prisma.productReview.deleteMany({ where: { id, storeId } });
  if (!count) throw new HttpError(404, "Review not found");
}

async function saveSettings(prisma, storeId, input) {
  const current = await requireInstalled(prisma, storeId);
  const next = {
    whoCanReview: ["anyone", "buyers"].includes(input.whoCanReview) ? input.whoCanReview : current.whoCanReview,
    autoPublish: ["all", "verified", "none"].includes(input.autoPublish) ? input.autoPublish : current.autoPublish,
    showOnCards: input.showOnCards !== undefined ? Boolean(input.showOnCards) : current.showOnCards,
  };
  await prisma.storeApp.updateMany({ where: { storeId, app: { key: APP_KEY } }, data: { settings: next } });
  return next;
}

// ── CSV import ─────────────────────────────────────────────────────

/** RFC 4180-ish: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
}

const COLUMNS = {
  slug: ["product_slug", "product_handle", "handle", "slug", "product"],
  rating: ["rating", "stars", "score"],
  title: ["title", "review_title", "headline"],
  body: ["body", "review", "content", "text", "review_body", "comment"],
  author: ["author", "name", "author_name", "reviewer", "reviewer_name", "customer_name"],
  email: ["email", "author_email", "reviewer_email", "customer_email"],
  date: ["date", "created_at", "review_date"],
  verified: ["verified", "verified_buyer", "verified_purchase"],
  reply: ["reply", "store_reply", "response"],
};

const MAX_ROWS = 5000;

/** Imports reviews from a CSV (one row per review, products matched by
 * their slug). Imported reviews are published — they're the seller's own
 * existing reviews. */
async function importCsv(prisma, storeId, csvText) {
  await requireInstalled(prisma, storeId);
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new HttpError(400, "The file has no reviews — the first row should be the column names.");
  if (rows.length - 1 > MAX_ROWS) throw new HttpError(400, `Up to ${MAX_ROWS} reviews per file.`);
  const header = rows[0].map((h) => String(h).trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, names]) => [k, header.findIndex((h) => names.includes(h))]));
  if (col.slug < 0) throw new HttpError(400, "Add a product_slug column — the product's URL name, e.g. pure-linen-shirt.");
  if (col.rating < 0) throw new HttpError(400, "Add a rating column (1 to 5).");
  if (col.body < 0) throw new HttpError(400, "Add a body column with the review text.");

  const products = await prisma.product.findMany({ where: { storeId }, select: { id: true, slug: true } });
  const bySlug = Object.fromEntries(products.map((p) => [p.slug.toLowerCase(), p.id]));
  const get = (r, k) => (col[k] >= 0 ? String(r[col[k]] ?? "").trim() : "");

  const data = [];
  const skipped = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const slug = get(r, "slug").toLowerCase().replace(/^.*\/products\//, "").replace(/[/?#].*$/, "");
    const productId = bySlug[slug];
    const rating = Math.round(Number(get(r, "rating")));
    const body = get(r, "body");
    if (!productId) return skipped.push({ line, reason: `No product with the slug “${slug || "(empty)"}”` });
    if (!(rating >= 1 && rating <= 5)) return skipped.push({ line, reason: "Rating must be 1 to 5" });
    if (!body) return skipped.push({ line, reason: "Review text is empty" });
    const date = get(r, "date") ? new Date(get(r, "date")) : null;
    const reply = get(r, "reply");
    data.push({
      storeId,
      productId,
      rating,
      title: get(r, "title").slice(0, 120) || null,
      body: body.slice(0, 3000),
      authorName: (get(r, "author") || "Customer").slice(0, 80),
      authorEmail: get(r, "email").toLowerCase().slice(0, 200) || null,
      verified: /^(1|true|yes|y)$/i.test(get(r, "verified")),
      status: "published",
      source: "import",
      reply: reply ? reply.slice(0, 2000) : null,
      repliedAt: reply ? new Date() : null,
      ...(date && !Number.isNaN(date.getTime()) && { createdAt: date }),
    });
  });
  if (data.length) await prisma.productReview.createMany({ data });
  return { imported: data.length, skipped: skipped.slice(0, 100), skippedCount: skipped.length };
}

module.exports = { APP_KEY, DEFAULTS, appSettings, requireInstalled, summaries, forProduct, submit, list, update, bulk, remove, saveSettings, importCsv, parseCsv };
