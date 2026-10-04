const { HttpError } = require("@shopcycle/utils");
const { PLACED } = require("../orders/placed");

/**
 * A shopper's buying behaviour — orders, cancellations, returns and
 * shipments that came back — in this store and across every Oyklane store,
 * matched by phone number and email. It helps a seller decide whether to
 * ship (say, a cash-on-delivery order from someone who returns most of what
 * they buy). Other stores are only ever counted: their names, products and
 * amounts are never shown. The privacy policy template says so.
 */

/** The ways one Indian mobile number gets written. */
function phoneVariants(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return [];
  const ten = digits.slice(-10);
  return [ten, `91${ten}`, `+91${ten}`, `0${ten}`, `+91 ${ten}`, `+91-${ten}`, `${ten.slice(0, 5)} ${ten.slice(5)}`, `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`];
}

const RETURNED = ["approved", "received", "closed"];

function blank() {
  return { orders: 0, delivered: 0, cancelled: 0, returnedOrders: 0, returnRequests: 0, undelivered: 0, cod: 0, itemsOrdered: 0, itemsReturned: 0 };
}

function tally(t, order) {
  t.orders += 1;
  if (order.paymentMethod === "cod") t.cod += 1;
  if (order.cancelledAt) t.cancelled += 1;
  const items = order.items.reduce((n, i) => n + i.quantity, 0);
  t.itemsOrdered += items;
  if (order.fulfillments.some((f) => f.status === "delivered")) t.delivered += 1;
  // A shipment cancelled after it left: refused at the door, not reachable, …
  t.undelivered += order.fulfillments.filter((f) => f.status === "cancelled").length ? 1 : 0;
  const returns = order.returns.filter((r) => r.status !== "declined");
  if (returns.length) t.returnRequests += 1;
  const done = returns.filter((r) => RETURNED.includes(r.status));
  if (done.length) t.returnedOrders += 1;
  for (const r of done) for (const line of Array.isArray(r.items) ? r.items : []) t.itemsReturned += Math.max(0, Number(line.quantity) || 0);
}

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

function rates(t) {
  return {
    ...t,
    returnRate: pct(t.itemsReturned, t.itemsOrdered),
    cancelRate: pct(t.cancelled, t.orders),
    undeliveredRate: pct(t.undelivered, t.orders - t.cancelled),
  };
}

/** low / medium / high, or "new" with too little history to tell. */
function risk(all) {
  // Orders whose outcome is known (delivered, cancelled or came back).
  const settled = all.delivered + all.cancelled + all.undelivered;
  if (all.orders < 2 || settled < 1) return { level: "new", label: "New shopper", detail: "Not enough orders yet to judge." };
  const bad = all.returnedOrders + all.cancelled + all.undelivered * 1.5;
  const score = bad / all.orders;
  if (score >= 0.4 || (all.undelivered >= 2 && all.undelivered / all.orders >= 0.25)) {
    return { level: "high", label: "High risk", detail: "Often returns, cancels or refuses orders. Consider asking for prepaid payment." };
  }
  if (score >= 0.15) return { level: "medium", label: "Some returns", detail: "Returns or cancels some orders — worth a quick confirmation call for COD." };
  return { level: "low", label: "Reliable", detail: "Keeps what they order." };
}

/**
 * @param {{ phone?: string, email?: string, excludeOrderId?: string }} who
 */
async function insightsFor(prisma, storeId, { phone, email, excludeOrderId } = {}) {
  const or = [];
  const variants = phoneVariants(phone);
  if (variants.length) or.push({ phone: { in: variants } });
  const mail = String(email || "").trim().toLowerCase();
  if (mail.includes("@")) or.push({ email: mail });
  if (!or.length) return null;

  const orders = await prisma.order.findMany({
    where: { AND: [PLACED, { OR: or }], ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}) },
    select: {
      storeId: true,
      paymentMethod: true,
      cancelledAt: true,
      createdAt: true,
      items: { select: { quantity: true } },
      fulfillments: { select: { status: true } },
      returns: { select: { status: true, items: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const here = blank();
  const all = blank();
  const stores = new Set();
  for (const o of orders) {
    tally(all, o);
    if (o.storeId === storeId) tally(here, o);
    stores.add(o.storeId);
  }
  stores.delete(storeId);
  const everywhere = rates(all);
  return {
    matchedBy: [variants.length && "phone", mail.includes("@") && "email"].filter(Boolean),
    thisStore: rates(here),
    allStores: everywhere,
    otherStores: stores.size,
    firstOrderAt: orders.length ? orders[orders.length - 1].createdAt : null,
    risk: risk(everywhere),
  };
}

/** For an order's page: the shopper's history, this order left out. */
async function forOrder(prisma, storeId, orderId) {
  const order = await prisma.order.findFirst({ where: { id: orderId, storeId }, select: { id: true, phone: true, email: true, customer: { select: { phone: true, email: true } } } });
  if (!order) throw new HttpError(404, "Order not found");
  return insightsFor(prisma, storeId, { phone: order.phone || order.customer?.phone, email: order.email || order.customer?.email, excludeOrderId: order.id });
}

async function forCustomer(prisma, storeId, customerId) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId }, select: { phone: true, email: true } });
  if (!customer) throw new HttpError(404, "Customer not found");
  return insightsFor(prisma, storeId, customer);
}

module.exports = { insightsFor, forOrder, forCustomer, phoneVariants };
