const { HttpError } = require("@shopcycle/utils");

/**
 * The only way stock changes. Each call moves one variant's
 * inventoryQuantity by `delta` and writes the InventoryAdjustment row that
 * explains it, so the number on the product page always has a history
 * behind it. Pass a transaction client (`tx`) to make the stock move part
 * of a bigger change — an order being placed or cancelled — so the two
 * can't come apart.
 *
 * Stock is allowed to go below zero: there's no reservation step before
 * checkout, and refusing a sale at the last step is worse than a backorder
 * the merchant can see (Products ▸ Inventory shows it in red).
 */
async function adjustStock(tx, { storeId, variantId, delta, reason, note = null, orderId = null, actorName = null }) {
  const change = Math.trunc(Number(delta));
  if (!change) return null;

  // Scoped update: a variant id from another store matches nothing.
  const { count } = await tx.productVariant.updateMany({
    where: { id: variantId, product: { storeId } },
    data: { inventoryQuantity: { increment: change } },
  });
  if (count === 0) return null;
  const variant = await tx.productVariant.findUnique({ where: { id: variantId }, select: { inventoryQuantity: true } });

  return tx.inventoryAdjustment.create({
    data: {
      storeId,
      variantId,
      delta: change,
      quantityAfter: variant.inventoryQuantity,
      reason,
      note,
      orderId,
      actorName,
    },
  });
}

/** Sets stock to an exact count (a stocktake) — recorded as the difference. */
async function setStock(tx, { storeId, variantId, quantity, reason = "correction", note = null, actorName = null }) {
  const variant = await tx.productVariant.findFirst({ where: { id: variantId, product: { storeId } } });
  if (!variant) throw new HttpError(404, "Variant not found");
  return adjustStock(tx, {
    storeId,
    variantId,
    delta: Math.trunc(Number(quantity)) - variant.inventoryQuantity,
    reason,
    note,
    actorName,
  });
}

module.exports = { adjustStock, setStock };
