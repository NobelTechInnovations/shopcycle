const { HttpError } = require("@shopcycle/utils");
const repository = require("./repository");

async function listDiscounts(prisma, storeId, query) {
  const [discounts, total] = await repository.list(prisma, storeId, query);
  return { discounts, total, page: query.page, pageSize: query.pageSize };
}

async function getDiscount(prisma, storeId, id) {
  const discount = await repository.findById(prisma, storeId, id);
  if (!discount) throw new HttpError(404, "Discount not found");
  return discount;
}

async function createDiscount(prisma, storeId, input) {
  const existing = await repository.findByCode(prisma, storeId, input.code);
  if (existing) throw new HttpError(409, `A discount with code "${input.code}" already exists`);
  return repository.create(prisma, storeId, input);
}

async function updateDiscount(prisma, storeId, id, input) {
  await getDiscount(prisma, storeId, id);
  if (input.code) {
    const existing = await repository.findByCode(prisma, storeId, input.code, id);
    if (existing) throw new HttpError(409, `A discount with code "${input.code}" already exists`);
  }
  return repository.update(prisma, id, input);
}

async function deleteDiscount(prisma, storeId, id) {
  await getDiscount(prisma, storeId, id);
  await repository.remove(prisma, id);
}

/** Validates a code against the same rules the cart will use — shared by
 * the admin (so a merchant editing a discount sees consistent behavior)
 * and the storefront cart. Returns the discount row or throws. */
async function resolveApplicableDiscount(prisma, storeId, code, subtotal) {
  const discount = await repository.findByCode(prisma, storeId, code.toUpperCase().trim());
  if (!discount) throw new HttpError(404, "Discount code not found");
  if (discount.status !== "active") throw new HttpError(400, "This discount code is no longer active");
  if (discount.startsAt && new Date() < discount.startsAt) throw new HttpError(400, "This discount code isn't active yet");
  if (discount.endsAt && new Date() > discount.endsAt) throw new HttpError(400, "This discount code has expired");
  if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
    throw new HttpError(400, "This discount code has reached its usage limit");
  }
  if (discount.minSubtotal && subtotal < Number(discount.minSubtotal)) {
    throw new HttpError(400, `This code requires a minimum order of ${discount.minSubtotal}`);
  }
  return discount;
}

function calculateDiscountAmount(discount, subtotal) {
  if (discount.type === "percentage") return subtotal * (Number(discount.value) / 100);
  return Math.min(Number(discount.value), subtotal);
}

/** Called once an order actually places (checkout/service.js) — applying a
 * code to a cart preview never counts against its usage limit, only a real
 * order does, matching how the limit is meant to work. */
function recordUsage(prisma, id) {
  return repository.incrementUsage(prisma, id);
}

module.exports = {
  listDiscounts,
  getDiscount,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  resolveApplicableDiscount,
  calculateDiscountAmount,
  recordUsage,
};
