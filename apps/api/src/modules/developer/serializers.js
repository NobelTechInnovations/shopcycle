/**
 * What the public API and webhooks return — stable, documented shapes in
 * snake_case, never raw database rows (no internal fields, no secrets).
 */
const num = (v) => (v == null ? null : Number(v));
const iso = (d) => (d ? new Date(d).toISOString() : null);

function product(p) {
  return {
    id: p.id,
    title: p.title,
    handle: p.slug,
    description: p.description || "",
    status: p.status,
    vendor: p.vendor || null,
    product_type: p.productType || null,
    brand: p.brand?.name || p.brand?.title || null,
    category: p.category?.name || p.category?.title || null,
    tags: String(p.tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    seo: { title: p.seoTitle || null, description: p.seoDescription || null },
    variants: (p.variants || []).map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku || null,
      price: num(v.price),
      compare_at_price: num(v.comparePrice),
      inventory_quantity: v.inventoryQuantity,
      weight: v.weight ?? null,
      status: v.status,
    })),
    images: (p.images || []).map((i) => ({ id: i.id, url: i.url, alt: i.altText || null, position: i.position, variant_id: i.variantId || null })),
    metafields: p.metafields || {},
    created_at: iso(p.createdAt),
    updated_at: iso(p.updatedAt),
  };
}

function customer(c) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone || null,
    city: c.city || null,
    province: c.province || null,
    zip: c.zip || null,
    country: c.country || null,
    accepts_email_marketing: Boolean(c.acceptsEmailMarketing),
    has_account: Boolean(c.passwordHash || c.emailVerifiedAt),
    created_at: iso(c.createdAt),
    updated_at: iso(c.updatedAt),
  };
}

function order(o) {
  return {
    id: o.id,
    number: o.orderNumber,
    email: o.email,
    phone: o.phone || null,
    note: o.customerNote || null,
    company: o.buyerCompany || null,
    gstin: o.buyerGstin || null,
    currency: o.currency || "INR",
    subtotal: num(o.subtotal),
    discount: num(o.discount),
    discount_code: o.discountCode || null,
    shipping: num(o.shipping),
    tax: num(o.tax),
    total: num(o.total),
    gift_card_amount: num(o.giftCardAmount) || 0,
    refunded_amount: num(o.refundedAmount) || 0,
    payment_method: o.paymentMethod,
    payment_status: o.paymentStatus,
    fulfillment_status: o.fulfillmentStatus,
    cancelled_at: iso(o.cancelledAt),
    cancel_reason: o.cancelReason || null,
    customer: o.customer ? { id: o.customer.id, name: o.customer.name, email: o.customer.email } : o.customerId ? { id: o.customerId } : null,
    shipping_address: {
      name: o.shippingName || null,
      address1: o.shippingAddress1 || null,
      address2: o.shippingAddress2 || null,
      city: o.shippingCity || null,
      province: o.shippingProvince || null,
      zip: o.shippingZip || null,
      country: o.shippingCountry || null,
    },
    line_items: (o.items || []).map((i) => ({
      id: i.id,
      product_id: i.productId || null,
      variant_id: i.variantId || null,
      title: i.title,
      quantity: i.quantity,
      price: num(i.price),
      total: num(i.total),
    })),
    fulfillments: (o.fulfillments || []).map((f) => ({
      id: f.id,
      status: f.status,
      courier: f.courier || null,
      tracking_number: f.trackingNumber || null,
      tracking_url: f.trackingUrl || null,
      items: f.items,
      shipped_at: iso(f.shippedAt),
      delivered_at: iso(f.deliveredAt),
    })),
    refunds: (o.refunds || []).map((r) => ({ id: r.id, amount: num(r.amount), method: r.method, reason: r.reason || null, created_at: iso(r.createdAt) })),
    created_at: iso(o.createdAt),
    updated_at: iso(o.updatedAt),
  };
}

module.exports = { product, customer, order };
