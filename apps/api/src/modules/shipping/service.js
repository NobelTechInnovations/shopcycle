const { HttpError } = require("@shopcycle/utils");
const repository = require("./repository");

async function listZones(prisma, storeId) {
  return repository.listZones(prisma, storeId);
}

async function getZone(prisma, storeId, id) {
  const zone = await repository.findZoneById(prisma, storeId, id);
  if (!zone) throw new HttpError(404, "Shipping zone not found");
  return zone;
}

function createZone(prisma, storeId, input) {
  return repository.createZone(prisma, storeId, input);
}

async function updateZone(prisma, storeId, id, input) {
  await getZone(prisma, storeId, id);
  return repository.updateZone(prisma, id, input);
}

async function deleteZone(prisma, storeId, id) {
  await getZone(prisma, storeId, id);
  await repository.removeZone(prisma, id);
}

async function addRate(prisma, storeId, zoneId, input) {
  await getZone(prisma, storeId, zoneId);
  return repository.createRate(prisma, zoneId, input);
}

async function updateRate(prisma, storeId, zoneId, rateId, input) {
  await getZone(prisma, storeId, zoneId);
  const rate = await repository.findRateById(prisma, zoneId, rateId);
  if (!rate) throw new HttpError(404, "Shipping rate not found");
  return repository.updateRate(prisma, rateId, input);
}

async function deleteRate(prisma, storeId, zoneId, rateId) {
  await getZone(prisma, storeId, zoneId);
  const rate = await repository.findRateById(prisma, zoneId, rateId);
  if (!rate) throw new HttpError(404, "Shipping rate not found");
  await repository.removeRate(prisma, rateId);
}

/** The cart's shipping estimate — cheapest configured rate, free if the
 * cart subtotal clears that rate's freeAbove threshold, or null if the
 * store hasn't configured shipping at all (cart just shows no shipping line). */
async function estimateShipping(prisma, storeId, subtotal) {
  const rate = await repository.findCheapestRate(prisma, storeId);
  if (!rate) return null;
  const free = rate.freeAbove != null && subtotal >= Number(rate.freeAbove);
  return { name: rate.name, amount: free ? 0 : Number(rate.price) };
}

module.exports = {
  listZones,
  getZone,
  createZone,
  updateZone,
  deleteZone,
  addRate,
  updateRate,
  deleteRate,
  estimateShipping,
};
