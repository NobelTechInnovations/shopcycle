const include = {
  customer: true,
  items: true,
};

/** Search matches an order number exactly ("1001" or "#1001") or a
 * substring of the customer's name or email, case-insensitively. */
function searchFilter(q) {
  if (!q) return {};
  const digits = q.replace(/^#/, "");
  const byCustomer = [
    { customer: { name: { contains: q, mode: "insensitive" } } },
    { customer: { email: { contains: q, mode: "insensitive" } } },
  ];
  // ≤9 digits: orderNumber is an Int column, so a longer number can't match
  // and would overflow the query.
  return /^\d{1,9}$/.test(digits) ? { OR: [{ orderNumber: Number(digits) }, ...byCustomer] } : { OR: byCustomer };
}

/** Set on an unpaid online order that was replaced when its shopper
 * checked out again from the same cart (checkout/service.js). Not a real
 * sale, so "All" leaves it out; "Cancelled" still lists it. */
const REPLACED_REASON = "Payment not completed — the customer checked out again";

const STATUS_FILTERS = {
  all: { AND: [{ OR: [{ cancelReason: null }, { cancelReason: { not: REPLACED_REASON } }] }] },
  unfulfilled: { fulfillmentStatus: { in: ["unfulfilled", "partially_fulfilled"] } },
  fulfilled: { fulfillmentStatus: "fulfilled" },
  cancelled: { fulfillmentStatus: "cancelled" },
  unpaid: { paymentStatus: "pending", fulfillmentStatus: { not: "cancelled" } },
};

function list(prisma, storeId, { status, q, page, pageSize }) {
  const where = {
    storeId,
    ...STATUS_FILTERS[status],
    ...searchFilter(q),
  };

  return Promise.all([
    prisma.order.findMany({
      where,
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);
}

function findById(prisma, storeId, id) {
  return prisma.order.findFirst({ where: { id, storeId }, include });
}

/** The store's highest order number + 1 (first order is #1001). Uses the
 * max, not a row count — a count reuses an existing number as soon as any
 * order is deleted, and every checkout after that fails. */
async function nextOrderNumber(prisma, storeId) {
  const { _max } = await prisma.order.aggregate({ where: { storeId }, _max: { orderNumber: true } });
  return (_max.orderNumber || 1000) + 1;
}

/** Runs `create(orderNumber)` with the next free number, retrying with a
 * fresh number if another order took it in the meantime (two checkouts in
 * the same instant) — the unique [storeId, orderNumber] index is what
 * detects the collision. */
async function withNextOrderNumber(prisma, storeId, create) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderNumber = await nextOrderNumber(prisma, storeId);
    try {
      return await create(orderNumber);
    } catch (err) {
      const target = String(err.meta?.target || "");
      if (err.code === "P2002" && target.includes("orderNumber")) continue;
      throw err;
    }
  }
  throw new Error("Could not allocate an order number — please try again");
}

function create(prisma, storeId, orderNumber, data, items) {
  return prisma.order.create({
    data: { ...data, storeId, orderNumber, items: { create: items } },
    include,
  });
}

function updateStatus(prisma, id, data) {
  return prisma.order.update({ where: { id }, data, include });
}

module.exports = { list, findById, nextOrderNumber, withNextOrderNumber, create, updateStatus, REPLACED_REASON };
