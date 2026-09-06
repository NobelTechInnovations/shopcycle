/** Builds the URL map handed to Liquid as `routes` — mirrors Shopify's
 * `routes.*` globals. Every internal link in a theme should be built from
 * this (or from a `.url` field derived from it) rather than a hardcoded
 * path, because every storefront route is namespaced under `/store/:handle`
 * for multi-tenancy — a bare `/cart` link would 404. */
function buildRoutes(handle) {
  const root = `/store/${handle}`;
  return {
    root_url: root,
    all_products_url: `${root}/collections/all`,
    cart_url: `${root}/cart`,
    cart_add_url: `${root}/cart/add`,
    cart_update_url: `${root}/cart/update`,
    cart_discount_url: `${root}/cart/discount`,
    cart_discount_remove_url: `${root}/cart/discount/remove`,
    pages_url: `${root}/pages`,
    checkout_url: `${root}/checkout`,
    search_url: `${root}/search`,
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

function serializeProduct(product, handle) {
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    description: product.description || "",
    url: `/store/${handle}/products/${product.slug}`,
    images: (product.images || []).map(serializeImage),
    variants: (product.variants || []).map(serializeVariant),
  };
}

function serializeCollection(collection, handle) {
  return {
    id: collection.id,
    title: collection.title,
    slug: collection.slug,
    description: collection.description || "",
    image: collection.image || null,
    url: `/store/${handle}/collections/${collection.slug}`,
    products: (collection.products || []).map((p) => serializeProduct(p, handle)),
  };
}

module.exports = { buildRoutes, serializeProduct, serializeCollection, serializeImage, serializeVariant };
