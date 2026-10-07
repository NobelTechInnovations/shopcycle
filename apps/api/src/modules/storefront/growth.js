const { z } = require("zod");
const { storefrontUrl, storefrontBaseUrl } = require("../../lib/storefront-url");
const { throttle } = require("../../lib/throttle");
const customersRepository = require("../customers/repository");
const { esc } = require("../../emails/templates");

/**
 * Growth endpoints every storefront gets without theme work:
 *   robots.txt  — keeps cart/checkout/account/search out of search engines
 *   sitemap.xml — every live product, collection, page and blog post
 *   newsletter  — a signup becomes a customer with email-marketing consent
 */

function robotsTxt(store) {
  const prefix = new URL(storefrontBaseUrl(store)).pathname.replace(/\/$/, "");
  return [
    "User-agent: *",
    ...["/cart", "/checkout", "/account", "/orders", "/search"].map((p) => `Disallow: ${prefix}${p}`),
    "",
    `Sitemap: ${storefrontUrl(store, "/sitemap.xml")}`,
    "",
  ].join("\n");
}

async function sitemapXml(prisma, store) {
  const now = new Date();
  const [products, collections, pages, articles] = await Promise.all([
    prisma.product.findMany({ where: { storeId: store.id, status: "active" }, select: { slug: true, updatedAt: true } }),
    prisma.collection.findMany({ where: { storeId: store.id, status: "active" }, select: { slug: true, updatedAt: true } }),
    prisma.page.findMany({ where: { storeId: store.id, status: "active" }, select: { slug: true, updatedAt: true } }),
    prisma.article.findMany({
      where: { storeId: store.id, status: "published", publishedAt: { lte: now } },
      select: { slug: true, updatedAt: true },
    }),
  ]);
  const entries = [
    { loc: storefrontUrl(store, "/"), lastmod: now, priority: "1.0" },
    ...collections.map((c) => ({ loc: storefrontUrl(store, `/collections/${c.slug}`), lastmod: c.updatedAt, priority: "0.8" })),
    ...products.map((p) => ({ loc: storefrontUrl(store, `/products/${p.slug}`), lastmod: p.updatedAt, priority: "0.9" })),
    ...pages.map((p) => ({ loc: storefrontUrl(store, `/pages/${p.slug}`), lastmod: p.updatedAt, priority: "0.5" })),
    { loc: storefrontUrl(store, "/contact"), lastmod: now, priority: "0.4" },
    ...(articles.length ? [{ loc: storefrontUrl(store, "/blog"), lastmod: now, priority: "0.6" }] : []),
    ...articles.map((a) => ({ loc: storefrontUrl(store, `/blog/${a.slug}`), lastmod: a.updatedAt, priority: "0.6" })),
  ];
  const urls = entries
    .map((e) => `  <url><loc>${esc(e.loc)}</loc><lastmod>${new Date(e.lastmod).toISOString().slice(0, 10)}</lastmod><priority>${e.priority}</priority></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

const newsletterSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(200),
  name: z.string().trim().max(120).optional(),
});

/** Signs an email up for marketing: an existing customer gets consent
 * turned on; a new address becomes a customer with consent. */
async function subscribe(fastify, store, body) {
  const { email, name } = newsletterSchema.parse(body);
  await throttle(fastify, `newsletter:${store.id}:${email.toLowerCase()}`, { max: 5, windowSeconds: 60 * 60 });
  const { prisma } = fastify;
  const existing = await customersRepository.findByEmail(prisma, store.id, email);
  if (existing) {
    if (!existing.acceptsEmailMarketing) {
      await prisma.customer.update({ where: { id: existing.id }, data: { acceptsEmailMarketing: true } });
    }
    return { subscribed: true, existing: true };
  }
  await customersRepository.create(prisma, store.id, {
    email: email.toLowerCase(),
    name: name || email.split("@")[0],
    acceptsEmailMarketing: true,
  });
  return { subscribed: true, existing: false };
}

module.exports = { robotsTxt, sitemapXml, subscribe };
