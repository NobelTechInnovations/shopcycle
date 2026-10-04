const { formatCurrency } = require("@shopcycle/utils");
const { PLACED } = require("../orders/placed");
const cartService = require("../cart/service");

/**
 * What a flow knows about the order, customer or checkout it's running
 * for — loaded fresh at every step, so a condition after a three-day wait
 * sees today's order (cancelled since? delivered?), not the one that
 * started the run.
 *
 *   facts      — the values Condition steps check (catalog FIELDS)
 *   vars       — what {{placeholders}} in an email become
 *   order/cart — the records themselves, for the email's summary and links
 */

const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";

async function customerFacts(prisma, storeId, { customerId, email, since }) {
  const who = customerId ? { customerId } : email ? { email: { equals: email, mode: "insensitive" } } : null;
  if (!who) return { orders_count: 0, total_spent: 0, ordered_since: false };
  const base = { storeId, cancelledAt: null, AND: [PLACED, who] };
  const [agg, later] = await Promise.all([
    prisma.order.aggregate({ where: base, _count: { _all: true }, _sum: { total: true } }),
    since ? prisma.order.count({ where: { ...base, createdAt: { gt: since } } }) : 0,
  ]);
  return { orders_count: agg._count._all, total_spent: Number(agg._sum.total || 0), ordered_since: later > 0 };
}

async function forOrder(prisma, store, orderId) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId: store.id },
    include: { customer: true, items: true, fulfillments: { orderBy: { createdAt: "asc" } } },
  });
  if (!order) return null;
  const email = order.email || order.customer?.email || null;
  const who = { customerId: order.customerId, email };
  const [stats, earlier] = await Promise.all([
    customerFacts(prisma, store.id, { ...who, since: order.createdAt }),
    prisma.order.count({
      where: { storeId: store.id, id: { not: order.id }, createdAt: { lt: order.createdAt }, AND: [PLACED, order.customerId ? { customerId: order.customerId } : { email: { equals: email || "-", mode: "insensitive" } }] },
    }),
  ]);
  const shipment = order.fulfillments.find((f) => f.status !== "cancelled");
  const name = order.shippingName || order.customer?.name || "";
  const itemsCount = order.items.reduce((n, i) => n + i.quantity, 0);
  return {
    subject: "order",
    email,
    order,
    facts: {
      "order.total": Number(order.total),
      "order.items_count": itemsCount,
      "order.payment_method": order.paymentMethod === "cod" ? "cod" : "online",
      "order.is_first_order": earlier === 0,
      "order.discount_code": order.discountCode || "",
      "order.product_titles": order.items.map((i) => i.title).join(" | "),
      "order.shipping_state": order.shippingProvince || "",
      "order.shipping_city": order.shippingCity || "",
      "order.is_cancelled": Boolean(order.cancelledAt),
      "order.is_refunded": Number(order.refundedAmount) > 0,
      "order.is_delivered": order.fulfillments.some((f) => f.status === "delivered"),
      "customer.accepts_marketing": Boolean(order.customer?.acceptsEmailMarketing),
      "customer.orders_count": stats.orders_count,
      "customer.total_spent": stats.total_spent,
      "customer.ordered_since": stats.ordered_since,
      "customer.has_phone": Boolean(order.phone || order.customer?.phone),
    },
    vars: {
      "customer.first_name": firstName(name) || "there",
      "customer.name": name || "there",
      "customer.email": email || "",
      "order.number": String(order.orderNumber),
      "order.total": formatCurrency(Number(order.total), order.currency),
      "order.first_item": order.items[0]?.title || "order",
      "order.items_count": String(itemsCount),
      "order.courier": shipment?.courier || "",
      "order.tracking_number": shipment?.trackingNumber || "",
    },
  };
}

async function forCustomer(prisma, store, customerId, since) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId: store.id } });
  if (!customer) return null;
  const stats = await customerFacts(prisma, store.id, { customerId: customer.id, since });
  return {
    subject: "customer",
    email: customer.email,
    customer,
    facts: {
      "customer.accepts_marketing": Boolean(customer.acceptsEmailMarketing),
      "customer.orders_count": stats.orders_count,
      "customer.total_spent": stats.total_spent,
      "customer.ordered_since": stats.ordered_since,
      "customer.has_phone": Boolean(customer.phone),
    },
    vars: {
      "customer.first_name": firstName(customer.name) || "there",
      "customer.name": customer.name || "there",
      "customer.email": customer.email,
    },
  };
}

async function forCart(prisma, store, cartId) {
  const row = await prisma.cartSession.findUnique({ where: { storeId_cartId: { storeId: store.id, cartId } } });
  if (!row || !row.email) return null;
  const cart = await cartService.hydrateCart(prisma, store.id, row.cartId, {
    items: Array.isArray(row.data?.items) ? row.data.items : [],
    discountCode: row.data?.discountCode || null,
  });
  const customer = await prisma.customer.findFirst({ where: { storeId: store.id, email: { equals: row.email, mode: "insensitive" } } });
  const stats = await customerFacts(prisma, store.id, { customerId: customer?.id, email: row.email, since: row.checkoutStartedAt || row.updatedAt });
  const name = row.customerName || customer?.name || "";
  return {
    subject: "cart",
    email: row.email,
    cart,
    cartRow: row,
    facts: {
      "cart.total": Number(cart.total || 0),
      "cart.items_count": cart.item_count || 0,
      "cart.recovered": Boolean(row.recoveredAt),
      "customer.accepts_marketing": Boolean(customer?.acceptsEmailMarketing),
      "customer.orders_count": stats.orders_count,
      "customer.total_spent": stats.total_spent,
      "customer.ordered_since": stats.ordered_since,
      "customer.has_phone": Boolean(customer?.phone),
    },
    vars: {
      "customer.first_name": firstName(name) || "there",
      "customer.name": name || "there",
      "customer.email": row.email,
      "cart.total": formatCurrency(Number(cart.total || 0), store.currency),
      "cart.first_item": cart.items[0]?.title || "cart",
    },
  };
}

/** The context for a run, or null when its subject is gone (order deleted,
 * cart expired) — the run then stops. */
async function load(prisma, store, subjectType, subjectId, { since } = {}) {
  let ctx = null;
  if (subjectType === "order") ctx = await forOrder(prisma, store, subjectId);
  else if (subjectType === "customer") ctx = await forCustomer(prisma, store, subjectId, since);
  else if (subjectType === "cart") ctx = await forCart(prisma, store, subjectId);
  if (ctx) ctx.vars["store.name"] = store.name;
  return ctx;
}

/** Made-up but realistic values — the builder's preview and "Send a test". */
function sample(store, subjectType) {
  const facts = {};
  const vars = {
    "customer.first_name": "Ananya",
    "customer.name": "Ananya Sharma",
    "customer.email": "ananya@example.com",
    "order.number": "1043",
    "order.total": formatCurrency(2299, store.currency),
    "order.first_item": "Pure Linen Shirt",
    "order.items_count": "2",
    "order.courier": "Delhivery",
    "order.tracking_number": "1490001234567",
    "cart.total": formatCurrency(1899, store.currency),
    "cart.first_item": "Pure Linen Shirt",
    "store.name": store.name,
  };
  const order = {
    orderNumber: 1043,
    currency: store.currency,
    subtotal: 2199,
    discount: 0,
    shipping: 100,
    tax: 0,
    total: 2299,
    giftCardAmount: 0,
    paymentMethod: "cod",
    items: [
      { title: "Pure Linen Shirt", quantity: 1, price: 1499, total: 1499 },
      { title: "Cotton Socks (pack of 3)", quantity: 1, price: 700, total: 700 },
    ],
  };
  return { subject: subjectType, email: "ananya@example.com", facts, vars, order: subjectType === "order" ? order : null, sample: true };
}

module.exports = { load, sample };
