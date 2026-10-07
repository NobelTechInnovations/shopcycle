const { storefrontUrl, storefrontBaseUrl } = require("../../lib/storefront-url");
const { storeSettings } = require("../../lib/store-settings");
const { esc } = require("../../emails/templates");

/**
 * Search engine and social sharing tags for every storefront page: title,
 * description, canonical URL, Open Graph / Twitter cards, and schema.org
 * structured data (Product with price and stock, BlogPosting,
 * BreadcrumbList, Organization + WebSite with site search).
 *
 * Added to <head> by the renderer on every page, whatever the theme, so
 * merchants get this without touching theme code. Pages a search engine
 * shouldn't index — cart, checkout, account, order and search pages — get
 * `noindex`.
 */

const NOINDEX = new Set(["search", "cart", "checkout", "account", "account-login", "order-status", "order-lookup", "order-confirmation", "404"]);

const stripHtml = (html) =>
  String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function clip(text, max = 160) {
  const t = stripHtml(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}…`;
}

function absolute(store, url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${storefrontBaseUrl(store)}${url.startsWith("/") ? url : `/${url}`}`;
}

function breadcrumb(store, items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: item.url })),
  };
}

/** Everything the head needs for this page. `ctx` is the render context. */
function buildSeo(store, templateName, ctx) {
  const settings = storeSettings(store).seo || {};
  const home = storefrontUrl(store, "/");
  const siteName = store.name;
  const seo = {
    title: settings.title || siteName,
    description: clip(settings.description || `Shop ${siteName} online.`),
    canonical: null,
    image: absolute(store, settings.image) || null,
    // Online Store ▸ Preferences ▸ Favicon — the icon on the browser tab.
    favicon: absolute(store, settings.favicon) || null,
    type: "website",
    noindex: NOINDEX.has(templateName),
    jsonLd: [],
  };

  if (templateName === "index") {
    seo.canonical = home;
    seo.jsonLd.push(
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: siteName,
        url: home,
        ...(seo.image && { logo: seo.image }),
        ...(store.supportEmail && { email: store.supportEmail }),
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: siteName,
        url: home,
        potentialAction: {
          "@type": "SearchAction",
          target: `${storefrontUrl(store, "/search")}?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      }
    );
  }

  if (templateName === "product" && ctx.product) {
    const p = ctx.product;
    const url = storefrontUrl(store, `/products/${p.slug}`);
    seo.title = p.seo_title || `${p.title} | ${siteName}`;
    seo.description = clip(p.seo_description || p.description || `${p.title} — buy online at ${siteName}.`);
    seo.canonical = url;
    seo.type = "product";
    seo.image = absolute(store, p.featured_image?.url) || seo.image;
    const offers = p.variants.map((v) => ({
      "@type": "Offer",
      price: v.price.toFixed(2),
      priceCurrency: store.currency,
      availability: v.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url,
      ...(v.sku && { sku: v.sku }),
      seller: { "@type": "Organization", name: siteName },
    }));
    seo.jsonLd.push({
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.title,
      description: clip(p.description, 5000) || undefined,
      image: p.images.map((i) => absolute(store, i.url)),
      url,
      ...(p.brand && { brand: { "@type": "Brand", name: p.brand } }),
      ...(p.price_variant?.sku && { sku: p.price_variant.sku }),
      offers: offers.length === 1 ? offers[0] : { "@type": "AggregateOffer", priceCurrency: store.currency, lowPrice: Math.min(...p.variants.map((v) => v.price)).toFixed(2), highPrice: Math.max(...p.variants.map((v) => v.price)).toFixed(2), offerCount: offers.length, offers },
    });
    const crumbs = [{ name: "Home", url: home }];
    if (p.collection) crumbs.push({ name: p.collection.title, url: storefrontUrl(store, `/collections/${p.collection.slug}`) });
    crumbs.push({ name: p.title, url });
    seo.jsonLd.push(breadcrumb(store, crumbs));
  }

  if (templateName === "collection" && ctx.collection) {
    const c = ctx.collection;
    const url = storefrontUrl(store, `/collections/${c.slug}`);
    seo.title = `${c.title} | ${siteName}`;
    seo.description = clip(c.description || `Shop ${c.title} at ${siteName}.`);
    seo.canonical = url;
    seo.image = absolute(store, c.image || c.products?.[0]?.featured_image?.url) || seo.image;
    seo.jsonLd.push(breadcrumb(store, [{ name: "Home", url: home }, { name: c.title, url }]));
  }

  if (templateName === "page" && ctx.page) {
    const url = storefrontUrl(store, `/pages/${ctx.page.slug}`);
    seo.title = ctx.page.seoTitle || `${ctx.page.title} | ${siteName}`;
    seo.description = clip(ctx.page.seoDescription || ctx.page.body || seo.description);
    seo.canonical = url;
  }

  if (templateName === "blog" && ctx.blog) {
    seo.title = `${ctx.blog.title} | ${siteName}`;
    seo.canonical = storefrontUrl(store, "/blog");
  }

  if (templateName === "article" && ctx.article) {
    const a = ctx.article;
    const url = storefrontUrl(store, `/blog/${a.slug}`);
    seo.title = a.seo_title || `${a.title} | ${siteName}`;
    seo.description = clip(a.seo_description || a.excerpt || a.content);
    seo.canonical = url;
    seo.type = "article";
    seo.image = absolute(store, a.image) || seo.image;
    seo.jsonLd.push({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: a.title,
      url,
      ...(seo.image && { image: [seo.image] }),
      ...(a.published_at && { datePublished: a.published_at }),
      ...(a.updated_at && { dateModified: a.updated_at }),
      author: { "@type": a.author ? "Person" : "Organization", name: a.author || siteName },
      publisher: { "@type": "Organization", name: siteName },
    });
    seo.jsonLd.push(breadcrumb(store, [{ name: "Home", url: home }, { name: ctx.blog?.title || "Blog", url: storefrontUrl(store, "/blog") }, { name: a.title, url }]));
  }

  if (templateName === "search") seo.title = `Search | ${siteName}`;
  if (templateName === "contact") {
    seo.title = `Contact us | ${siteName}`;
    seo.description = clip(`Get in touch with ${siteName} — send a message and we'll reply by email.`);
    seo.canonical = storefrontUrl(store, "/contact");
  }
  if (templateName === "cart") seo.title = `Your cart | ${siteName}`;
  if (templateName === "404") seo.title = `Page not found | ${siteName}`;
  return seo;
}

/** The HTML for <head>. Every value is escaped — titles and descriptions
 * are merchant text; JSON-LD has `<` escaped so it can't close the tag. */
function seoTags(seo) {
  const tags = [];
  if (seo.favicon) tags.push(`<link rel="icon" href="${esc(seo.favicon)}"><link rel="apple-touch-icon" href="${esc(seo.favicon)}">`);
  if (seo.description) tags.push(`<meta name="description" content="${esc(seo.description)}">`);
  if (seo.noindex) tags.push('<meta name="robots" content="noindex, follow">');
  if (seo.canonical) tags.push(`<link rel="canonical" href="${esc(seo.canonical)}">`);
  tags.push(`<meta property="og:type" content="${seo.type}">`);
  tags.push(`<meta property="og:title" content="${esc(seo.title)}">`);
  if (seo.description) tags.push(`<meta property="og:description" content="${esc(seo.description)}">`);
  if (seo.canonical) tags.push(`<meta property="og:url" content="${esc(seo.canonical)}">`);
  if (seo.image) tags.push(`<meta property="og:image" content="${esc(seo.image)}">`);
  tags.push(`<meta name="twitter:card" content="${seo.image ? "summary_large_image" : "summary"}">`);
  for (const data of seo.jsonLd) {
    tags.push(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`);
  }
  return tags.join("");
}

module.exports = { buildSeo, seoTags, stripHtml, clip, NOINDEX };
