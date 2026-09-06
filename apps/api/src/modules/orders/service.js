const { HttpError } = require("@shopcycle/utils");
const repository = require("./repository");

function computeTotals(items, { discount = 0, shipping = 0, tax = 0 }) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const total = subtotal - discount + shipping + tax;
  return { subtotal, total };
}

async function listOrders(prisma, storeId, query) {
  const [orders, total] = await repository.list(prisma, storeId, query);
  return { orders, total, page: query.page, pageSize: query.pageSize };
}

async function getOrder(prisma, storeId, id) {
  const order = await repository.findById(prisma, storeId, id);
  if (!order) throw new HttpError(404, "Order not found");
  return order;
}

async function createOrder(prisma, storeId, input) {
  const { items, ...rest } = input;
  const { subtotal, total } = computeTotals(items, rest);
  const items_ = items.map((item) => ({ ...item, total: item.quantity * item.price }));

  // Not perfectly race-safe under concurrent writes (Phase 5 revisits this
  // with a DB-level sequence); acceptable for the current admin-only flow.
  const orderNumber = await repository.nextOrderNumber(prisma, storeId);
  return repository.create(prisma, storeId, orderNumber, { ...rest, subtotal, total }, items_);
}

async function updateOrderStatus(prisma, storeId, id, input) {
  await getOrder(prisma, storeId, id);
  return repository.updateStatus(prisma, id, input);
}

module.exports = { listOrders, getOrder, createOrder, updateOrderStatus };
