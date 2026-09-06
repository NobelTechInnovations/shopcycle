const { HttpError } = require("@shopcycle/utils");
const repository = require("./repository");

function listTaxRates(prisma, storeId) {
  return repository.list(prisma, storeId);
}

async function getTaxRate(prisma, storeId, id) {
  const rate = await repository.findById(prisma, storeId, id);
  if (!rate) throw new HttpError(404, "Tax rate not found");
  return rate;
}

function createTaxRate(prisma, storeId, input) {
  return repository.create(prisma, storeId, input);
}

async function updateTaxRate(prisma, storeId, id, input) {
  await getTaxRate(prisma, storeId, id);
  return repository.update(prisma, id, input);
}

async function deleteTaxRate(prisma, storeId, id) {
  await getTaxRate(prisma, storeId, id);
  await repository.remove(prisma, id);
}

async function estimateTax(prisma, storeId, taxableAmount) {
  const rate = await repository.findFirst(prisma, storeId);
  if (!rate) return null;
  return { name: rate.name, rate: Number(rate.rate), amount: taxableAmount * (Number(rate.rate) / 100) };
}

module.exports = { listTaxRates, getTaxRate, createTaxRate, updateTaxRate, deleteTaxRate, estimateTax };
