const { HttpError, slugify } = require("@shopcycle/utils");
const { stripHtml, clip } = require("../storefront/seo");

/**
 * The store's blog (Content ▸ Blog posts in the admin; /blog on the
 * storefront). A post is visible to shoppers once it's published and its
 * publish date has arrived — so a post can be scheduled.
 */

const PAGE_SIZE = 12;

function liveWhere(storeId) {
  return { storeId, status: "published", publishedAt: { lte: new Date() } };
}

function dateLabel(d, timeZone = "Asia/Kolkata") {
  return d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone }) : null;
}

function tagList(tags) {
  return String(tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function readingMinutes(body) {
  const words = stripHtml(body).split(" ").filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Posts can be written as HTML or as plain text; plain text becomes
 * paragraphs (a blank line between them) with line breaks kept. */
function bodyHtml(body) {
  const text = String(body || "");
  if (/<\/?[a-z][^>]*>/i.test(text)) return text;
  return text
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${para.replace(/[&<>"']/g, (c) => ESC[c]).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/** A post as the storefront sees it. `full` adds the body. */
function serializeArticle(article, routes, { full = false, timeZone } = {}) {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    url: `${routes.blog_url}/${article.slug}`,
    excerpt: article.excerpt || clip(article.body, 180) || null,
    image: article.image || null,
    image_alt: article.imageAlt || null,
    author: article.author || null,
    tags: tagList(article.tags),
    date: dateLabel(article.publishedAt, timeZone),
    published_at: article.publishedAt,
    updated_at: article.updatedAt,
    reading_minutes: readingMinutes(article.body),
    seo_title: article.seoTitle || null,
    seo_description: article.seoDescription || null,
    ...(full && { content: bodyHtml(article.body) }),
  };
}

async function latestArticles(prisma, store, routes, limit = 6) {
  const rows = await prisma.article.findMany({ where: liveWhere(store.id), orderBy: { publishedAt: "desc" }, take: limit });
  return rows.map((a) => serializeArticle(a, routes, { timeZone: store.timezone }));
}

async function blogPage(prisma, store, routes, { page = 1, tag } = {}) {
  const where = { ...liveWhere(store.id), ...(tag && { tags: { contains: tag, mode: "insensitive" } }) };
  const total = await prisma.article.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const rows = await prisma.article.findMany({ where, orderBy: { publishedAt: "desc" }, skip: (current - 1) * PAGE_SIZE, take: PAGE_SIZE });
  return {
    articles: rows.map((a) => serializeArticle(a, routes, { timeZone: store.timezone })),
    total,
    page: current,
    pages,
  };
}

async function articleBySlug(prisma, store, routes, slug) {
  const row = await prisma.article.findFirst({ where: { ...liveWhere(store.id), slug: String(slug || "") } });
  if (!row) throw new HttpError(404, "Post not found");
  const tags = tagList(row.tags);
  const related = await prisma.article.findMany({
    where: {
      ...liveWhere(store.id),
      id: { not: row.id },
      ...(tags.length && { OR: tags.map((t) => ({ tags: { contains: t, mode: "insensitive" } })) }),
    },
    orderBy: { publishedAt: "desc" },
    take: 3,
  });
  return {
    ...serializeArticle(row, routes, { full: true, timeZone: store.timezone }),
    related: related.map((a) => serializeArticle(a, routes, { timeZone: store.timezone })),
  };
}

// ── Admin ───────────────────────────────────────────────────────────

async function uniqueSlug(prisma, storeId, source, excludeId) {
  const base = slugify(source) || "post";
  let slug = base;
  for (let i = 2; await prisma.article.findFirst({ where: { storeId, slug, ...(excludeId && { id: { not: excludeId } }) } }); i += 1) {
    slug = `${base}-${i}`;
  }
  return slug;
}

async function listForAdmin(prisma, storeId, { q, status, page = 1, pageSize = 20 }) {
  const where = {
    storeId,
    ...(status && status !== "all" && { status }),
    ...(q && { title: { contains: q, mode: "insensitive" } }),
  };
  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: [{ publishedAt: { sort: "desc", nulls: "first" } }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, title: true, slug: true, status: true, publishedAt: true, updatedAt: true, image: true, author: true, tags: true },
    }),
    prisma.article.count({ where }),
  ]);
  return { articles, total };
}

async function getForAdmin(prisma, storeId, id) {
  const row = await prisma.article.findFirst({ where: { id, storeId } });
  if (!row) throw new HttpError(404, "Post not found");
  return row;
}

function normalizeInput(input) {
  const data = {
    title: input.title,
    excerpt: input.excerpt || null,
    body: input.body || null,
    image: input.image || null,
    imageAlt: input.imageAlt || null,
    author: input.author || null,
    tags: tagList(input.tags).join(", ") || null,
    status: input.status,
    seoTitle: input.seoTitle || null,
    seoDescription: input.seoDescription || null,
  };
  // Publishing stamps the date (unless one was chosen — scheduling).
  if (input.status === "published") data.publishedAt = input.publishedAt ? new Date(input.publishedAt) : undefined;
  return data;
}

async function createArticle(prisma, storeId, input) {
  const data = normalizeInput(input);
  if (data.status === "published" && !data.publishedAt) data.publishedAt = new Date();
  return prisma.article.create({ data: { ...data, storeId, slug: await uniqueSlug(prisma, storeId, input.slug || input.title) } });
}

async function updateArticle(prisma, storeId, id, input) {
  const current = await getForAdmin(prisma, storeId, id);
  const data = normalizeInput(input);
  if (data.status === "published" && !data.publishedAt) data.publishedAt = current.publishedAt || new Date();
  if (data.status === "draft") data.publishedAt = current.publishedAt; // keep the original date if re-published
  const slug = input.slug && input.slug !== current.slug ? await uniqueSlug(prisma, storeId, input.slug, id) : undefined;
  return prisma.article.update({ where: { id }, data: { ...data, ...(slug && { slug }) } });
}

async function deleteArticle(prisma, storeId, id) {
  await getForAdmin(prisma, storeId, id);
  await prisma.article.delete({ where: { id } });
}

module.exports = {
  serializeArticle,
  latestArticles,
  blogPage,
  articleBySlug,
  listForAdmin,
  getForAdmin,
  createArticle,
  updateArticle,
  deleteArticle,
};
