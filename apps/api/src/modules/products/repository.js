const { adjustStock } = require("../../lib/inventory");

const include = {
  variants: { orderBy: { createdAt: "asc" } },
  images: { orderBy: { position: "asc" } },
  collectionProducts: { include: { collection: true } },
  brand: true,
  category: true,
};

function list(prisma, storeId, { q, status, page, pageSize }) {
  const where = {
    storeId,
    ...(status ? { status } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
  };

  return Promise.all([
    prisma.product.findMany({
      where,
      include: { variants: true, images: { orderBy: { position: "asc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);
}

function findById(prisma, storeId, id) {
  return prisma.product.findFirst({ where: { id, storeId }, include });
}

function count(prisma, storeId) {
  return prisma.product.count({ where: { storeId } });
}

function findBySlug(prisma, storeId, slug, excludeId) {
  return prisma.product.findFirst({
    where: { storeId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

/** Opening stock is recorded like any other stock change, so a variant's
 * history starts from its first unit (see lib/inventory.js). */
async function recordOpeningStock(tx, storeId, variants, actorName) {
  // One insert for all of them — a product with dozens of size/colour
  // variants shouldn't make dozens of round trips inside the transaction.
  const data = variants
    .filter((v) => v.inventoryQuantity)
    .map((v) => ({
      storeId,
      variantId: v.id,
      delta: v.inventoryQuantity,
      quantityAfter: v.inventoryQuantity,
      reason: "received",
      note: "Opening stock",
      actorName: actorName || null,
    }));
  if (data.length) await tx.inventoryAdjustment.createMany({ data });
}

// Saving a product with many variants is several statements; the default
// 5s interactive-transaction limit is too tight against a remote database.
const TX = { timeout: 20000, maxWait: 10000 };

function create(prisma, storeId, { variants, images, collectionIds, ...data }, slug, { actorName } = {}) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        ...data,
        storeId,
        slug,
        variants: { create: variants.map(({ id, ...v }) => ({ ...v, inventoryQuantity: v.inventoryQuantity ?? 0 })) },
        images: { create: images },
        collectionProducts: {
          create: collectionIds.map((collectionId) => ({ collectionId })),
        },
      },
      include,
    });
    await recordOpeningStock(tx, storeId, product.variants, actorName);
    return product;
  }, TX);
}

/**
 * Brings a product's variants in line with the form: existing variants
 * (matched by id) are updated in place, new ones created, and only the
 * ones the merchant removed are deleted. Recreating them all (as this
 * used to) would unlink every past order line from its variant, empty the
 * product out of shoppers' carts, and wipe its stock history.
 *
 * A variant's stock only changes when the form sends inventoryQuantity —
 * it's left out when unchanged, so a save doesn't overwrite sales made
 * while the page was open. A change is recorded as a stock correction.
 */
async function syncVariants(tx, storeId, productId, variants, actorName) {
  const existing = await tx.productVariant.findMany({ where: { productId } });
  const byId = Object.fromEntries(existing.map((v) => [v.id, v]));
  const keep = new Set(variants.filter((v) => v.id && byId[v.id]).map((v) => v.id));

  const removed = existing.filter((v) => !keep.has(v.id)).map((v) => v.id);
  if (removed.length) await tx.productVariant.deleteMany({ where: { id: { in: removed } } });

  for (const { id, inventoryQuantity, ...fields } of variants) {
    const current = id && byId[id];
    if (!current) {
      const created = await tx.productVariant.create({ data: { ...fields, productId, inventoryQuantity: inventoryQuantity ?? 0 } });
      await recordOpeningStock(tx, storeId, [created], actorName);
      continue;
    }
    await tx.productVariant.update({ where: { id }, data: fields });
    if (inventoryQuantity !== undefined && inventoryQuantity !== current.inventoryQuantity) {
      await adjustStock(tx, {
        storeId,
        variantId: id,
        delta: inventoryQuantity - current.inventoryQuantity,
        reason: "correction",
        note: "Edited on the product page",
        actorName,
      });
    }
  }
}

async function update(prisma, id, { variants, images, collectionIds, ...data }, slug, { storeId, actorName } = {}) {
  return prisma.$transaction(async (tx) => {
    if (variants) {
      await syncVariants(tx, storeId, id, variants, actorName);
    }
    if (images) {
      await tx.productImage.deleteMany({ where: { productId: id } });
    }
    if (collectionIds) {
      await tx.collectionProduct.deleteMany({ where: { productId: id } });
    }

    return tx.product.update({
      where: { id },
      data: {
        ...data,
        ...(slug ? { slug } : {}),
        ...(images ? { images: { create: images } } : {}),
        ...(collectionIds
          ? { collectionProducts: { create: collectionIds.map((collectionId) => ({ collectionId })) } }
          : {}),
      },
      include,
    });
  }, TX);
}

function remove(prisma, id) {
  return prisma.product.delete({ where: { id } });
}

module.exports = { list, findById, findBySlug, count, create, update, remove };
