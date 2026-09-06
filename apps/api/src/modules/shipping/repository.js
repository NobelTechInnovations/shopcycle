const zoneInclude = { rates: { orderBy: { price: "asc" } } };

function listZones(prisma, storeId) {
  return prisma.shippingZone.findMany({ where: { storeId }, include: zoneInclude, orderBy: { createdAt: "asc" } });
}

function findZoneById(prisma, storeId, id) {
  return prisma.shippingZone.findFirst({ where: { id, storeId }, include: zoneInclude });
}

function createZone(prisma, storeId, data) {
  return prisma.shippingZone.create({ data: { ...data, storeId }, include: zoneInclude });
}

function updateZone(prisma, id, data) {
  return prisma.shippingZone.update({ where: { id }, data, include: zoneInclude });
}

function removeZone(prisma, id) {
  return prisma.shippingZone.delete({ where: { id } });
}

function createRate(prisma, zoneId, data) {
  return prisma.shippingRate.create({ data: { ...data, zoneId } });
}

function findRateById(prisma, zoneId, rateId) {
  return prisma.shippingRate.findFirst({ where: { id: rateId, zoneId } });
}

function updateRate(prisma, rateId, data) {
  return prisma.shippingRate.update({ where: { id: rateId }, data });
}

function removeRate(prisma, rateId) {
  return prisma.shippingRate.delete({ where: { id: rateId } });
}

/** Cheapest rate across every zone for this store — used by the cart, which
 * doesn't yet collect a shipping address (see the ShippingZone model's
 * doc comment on this simplification). */
function findCheapestRate(prisma, storeId) {
  return prisma.shippingRate.findFirst({
    where: { zone: { storeId } },
    orderBy: { price: "asc" },
  });
}

module.exports = {
  listZones,
  findZoneById,
  createZone,
  updateZone,
  removeZone,
  createRate,
  findRateById,
  updateRate,
  removeRate,
  findCheapestRate,
};
