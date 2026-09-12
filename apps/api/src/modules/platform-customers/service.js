const { normalizePhone } = require("../../lib/phone");

/**
 * Resolves (or creates) the PlatformCustomer a store's Customer row should
 * link to — called from customers/repository.js on every create/update, so
 * a store's own admin never has to know this exists. Phone is the primary
 * match key (more reliable across Indian D2C checkout than email, and the
 * key WhatsApp/OTP flows will need anyway); email is only a fallback for a
 * customer who never gave a phone number.
 *
 * Deliberately never *changes* an existing link — once a Customer row is
 * attached to a PlatformCustomer, an email edit alone won't move it to a
 * different one (that would silently merge two different people's order
 * history if the merchant just fixed a typo). A `phone` value that's new
 * or wasn't resolvable before is the only thing that (re)triggers linking.
 */
async function linkCustomer(prisma, existingPlatformCustomerId, { phone, email }) {
  if (existingPlatformCustomerId) return existingPlatformCustomerId;

  const normalizedPhone = phone ? normalizePhone(phone) : null;
  if (normalizedPhone) {
    const byPhone = await prisma.platformCustomer.upsert({
      where: { phone: normalizedPhone },
      update: {},
      create: { phone: normalizedPhone, email: email || null },
    });
    return byPhone.id;
  }

  if (email) {
    const byEmail = await prisma.platformCustomer.findFirst({ where: { email } });
    if (byEmail) return byEmail.id;
    const created = await prisma.platformCustomer.create({ data: { email } });
    return created.id;
  }

  return null;
}

/** Super-admin only — every store a phone/email has ever ordered from,
 * for cross-store marketing (see PlatformCustomer's doc comment in
 * schema.prisma for what this is/isn't yet). */
async function search(prisma, { q, page = 1, pageSize = 25 }) {
  const where = q
    ? {
        OR: [
          { phone: { contains: normalizePhone(q) || q } },
          { email: { contains: q } },
          { name: { contains: q } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    prisma.platformCustomer.findMany({
      where,
      include: { customers: { include: { store: { select: { id: true, name: true, handle: true } } } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.platformCustomer.count({ where }),
  ]);

  return {
    total,
    page,
    pageSize,
    customers: rows.map(serialize),
  };
}

async function getById(prisma, id) {
  const row = await prisma.platformCustomer.findUnique({
    where: { id },
    include: {
      customers: {
        include: {
          store: { select: { id: true, name: true, handle: true } },
          orders: { select: { id: true, total: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  return row ? serialize(row) : null;
}

function serialize(row) {
  const stores = row.customers.map((c) => ({
    storeId: c.store.id,
    storeName: c.store.name,
    storeHandle: c.store.handle,
    customerId: c.id,
    name: c.name,
    email: c.email,
    orderCount: c.orders?.length ?? undefined,
    totalSpent: c.orders ? c.orders.reduce((sum, o) => sum + Number(o.total), 0) : undefined,
  }));
  return {
    id: row.id,
    phone: row.phone,
    email: row.email,
    name: row.name || stores[0]?.name || null,
    storeCount: stores.length,
    stores,
    createdAt: row.createdAt,
  };
}

module.exports = { linkCustomer, search, getById };
