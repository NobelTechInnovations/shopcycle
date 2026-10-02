/** Builds the URL map handed to Liquid as `routes` — mirrors Shopify's
 * `routes.*` globals. Every internal link in a theme should be built from
 * this (or from a `.url` field derived from it) rather than a hardcoded
 * path.
 *
 * `rootless` is true whenever the visitor reached this store through its
 * own (sub)domain — either the platform-assigned `{handle}.<root domain>`
 * (see apps/storefront/proxy.js) or a merchant's connected custom domain —
 * rather than the internal `/store/:handle` path used for admin previews.
 * On that domain the storefront IS the whole site, so every link should be
 * a clean root-relative path (`/cart`, not `/store/acme/cart`) — a visitor
 * should never see `/store/:handle` in their address bar. The internal
 * path keeps working exactly as before (unprefixed by nothing changes
 * there) since previews still rely on it. */
function buildRoutes(handle, { rootless = false } = {}) {
  const root = rootless ? "" : `/store/${handle}`;
  return {
    root_url: root || "/",
    // A safe prefix for "{{ routes.collections_url }}/{{ handle }}" — never
    // concatenate a path onto root_url directly, since it's "/" (not "")
    // in rootless mode and would double up the leading slash.
    collections_url: `${root}/collections`,
    all_products_url: `${root}/collections/all`,
    cart_url: `${root}/cart`,
    cart_add_url: `${root}/cart/add`,
    cart_update_url: `${root}/cart/update`,
    cart_discount_url: `${root}/cart/discount`,
    cart_discount_remove_url: `${root}/cart/discount/remove`,
    cart_gift_card_url: `${root}/cart/gift-card`,
    cart_gift_card_remove_url: `${root}/cart/gift-card/remove`,
    pages_url: `${root}/pages`,
    checkout_url: `${root}/checkout`,
    search_url: `${root}/search`,
    // Shopper accounts and order status (Phase 4).
    account_url: `${root}/account`,
    account_login_url: `${root}/account/login`,
    account_logout_url: `${root}/account/logout`,
    account_update_url: `${root}/account/update`,
    account_register_url: `${root}/account/register`,
    account_password_url: `${root}/account/password`,
    order_lookup_url: `${root}/orders/lookup`,
    orders_url: `${root}/orders`,
    // Growth (Phase 6)
    blog_url: `${root}/blog`,
    newsletter_url: `${root}/newsletter`,
  };
}

function serializeImage(image) {
  return { url: image.url, altText: image.altText || "" };
}

function serializeVariant(variant) {
  return {
    id: variant.id,
    title: variant.title,
    sku: variant.sku,
    price: Number(variant.price),
    comparePrice: variant.comparePrice ? Number(variant.comparePrice) : null,
    inventoryQuantity: variant.inventoryQuantity,
    available: variant.inventoryQuantity > 0,
  };
}

function serializeProduct(product, handle, { rootless = false } = {}) {
  const root = rootless ? "" : `/store/${handle}`;
  const variants = (product.variants || []).map(serializeVariant);
  // The cheapest variant drives "from" prices and the card's sale badge.
  const priceVariant = variants.reduce((min, v) => (!min || v.price < min.price ? v : min), null);
  const prices = variants.map((v) => v.price);
  const onSale = Boolean(priceVariant && priceVariant.comparePrice && priceVariant.comparePrice > priceVariant.price);
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    handle: product.slug,
    description: product.description || "",
    url: `${root}/products/${product.slug}`,
    images: (product.images || []).map(serializeImage),
    featured_image: product.images?.[0] ? serializeImage(product.images[0]) : null,
    variants,
    price_variant: priceVariant,
    price: priceVariant ? priceVariant.price : 0,
    price_varies: prices.length > 1 && Math.min(...prices) !== Math.max(...prices),
    compare_at_price: priceVariant?.comparePrice || null,
    on_sale: onSale,
    discount_percent: onSale ? Math.round(((priceVariant.comparePrice - priceVariant.price) / priceVariant.comparePrice) * 100) : 0,
    available: variants.some((v) => v.available),
    vendor: product.vendor || null,
    brand: product.brand?.title || product.vendor || null,
    category: product.category?.title || null,
    product_type: product.productType || null,
    tags: String(product.tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    created_at: product.createdAt || null,
    seo_title: product.seoTitle || null,
    seo_description: product.seoDescription || null,
    // Custom data (Settings ▸ Custom data): product.metafields.custom.fabric
    metafields: { custom: product.metafields || {} },
    // Its theme template: templates/product.<suffix>.json (null = default).
    template_suffix: product.templateSuffix || null,
  };
}

function serializeCollection(collection, handle, { rootless = false } = {}) {
  const root = rootless ? "" : `/store/${handle}`;
  return {
    id: collection.id,
    title: collection.title,
    slug: collection.slug,
    description: collection.description || "",
    image: collection.image || null,
    url: `${root}/collections/${collection.slug}`,
    metafields: { custom: collection.metafields || {} },
    template_suffix: collection.templateSuffix || null,
    products: (collection.products || []).map((p) => serializeProduct(p, handle, { rootless })),
  };
}

module.exports = { buildRoutes, serializeProduct, serializeCollection, serializeImage, serializeVariant };
