const { adjustStock } = require("../../lib/inventory");
const { sizesAndColours, variantHasPart } = require("../../lib/variant-options");

const include = {
  variants: { orderBy: { createdAt: "asc" } },
  images: { orderBy: { position: "asc" } },
  collectionProducts: { include: { collection: true } },
  brand: true,
  category: true,
};

// "Low stock": nothing over this many left in any size.
const LOW_STOCK = 5;
const SORTS = {
  updated: { updatedAt: "desc" },
  created: { createdAt: "desc" },
  oldest: { createdAt: "asc" },
  title: { title: "asc" },
  "title-desc": { title: "desc" },
};

/** The products list's filters, as a Prisma where. */
function listWhere(storeId, f) {
  const and = [];
  if (f.q) {
    const q = f.q.trim();
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { variants: { some: { sku: { contains: q, mode: "insensitive" } } } },
        { vendor: { contains: q, mode: "insensitive" } },
        { tags: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (f.stock === "out") and.push({ variants: { none: { inventoryQuantity: { gt: 0 } } } });
  if (f.stock === "in") and.push({ variants: { some: { inventoryQuantity: { gt: LOW_STOCK } } } });
  if (f.stock === "low") and.push({ variants: { some: { inventoryQuantity: { gt: 0 } } } }, { variants: { none: { inventoryQuantity: { gt: LOW_STOCK } } } });
  if (f.size) and.push({ variants: { some: variantHasPart(f.size) } });
  if (f.colour) and.push({ variants: { some: variantHasPart(f.colour) } });
  if (f.tag) and.push({ tags: { contains: f.tag, mode: "insensitive" } });
  if (f.priceMin != null) and.push({ variants: { some: { price: { gte: f.priceMin } } } });
  if (f.priceMax != null) and.push({ variants: { some: { price: { lte: f.priceMax } } } });
  return {
    storeId,
    ...(f.status && { status: f.status }),
    ...(f.categoryId && { categoryId: f.categoryId }),
    ...(f.brandId && { brandId: f.brandId }),
    ...(f.collectionId && { collectionProducts: { some: { collectionId: f.collectionId } } }),
    ...(f.productType && { productType: { equals: f.productType, mode: "insensitive" } }),
    ...(f.vendor && { vendor: { equals: f.vendor, mode: "insensitive" } }),
    ...(f.channel === "hidden-google" && { hiddenChannels: { has: "google" } }),
    ...(f.channel === "hidden-facebook" && { hiddenChannels: { has: "facebook" } }),
    ...(f.channel === "rental" && { rental: { is: { enabled: true } } }),
    ...(and.length && { AND: and }),
  };
}

function list(prisma, storeId, filters) {
  const { page, pageSize, sort } = filters;
  const where = listWhere(storeId, filters);
  return Promise.all([
    prisma.product.findMany({
      where,
      // rental: the theme editor previews the Rental template with a rented product.
      include: {
        variants: { orderBy: { createdAt: "asc" } },
        images: { orderBy: { position: "asc" }, take: 1 },
        rental: { select: { enabled: true } },
        category: { select: { id: true, title: true } },
        brand: { select: { id: true, title: true } },
        collectionProducts: { select: { collection: { select: { id: true, title: true } } }, take: 5 },
      },
      orderBy: SORTS[sort] || SORTS.updated,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);
}

/** Units sold of each product in the last `days` days (cancelled orders left out). */
async function unitsSold(prisma, storeId, productIds, days = 30) {
  if (!productIds.length) return {};
  const rows = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds }, order: { storeId, cancelledAt: null, createdAt: { gte: new Date(Date.now() - days * 86400000) } } },
    _sum: { quantity: true },
  });
  return Object.fromEntries(rows.map((r) => [r.productId, r._sum.quantity || 0]));
}

/** Choices for the list's filters: the product types, vendors, sizes,
 * colours and tags the store uses. */
async function facets(prisma, storeId) {
  const [types, vendors, variants, tagRows] = await Promise.all([
    prisma.product.findMany({ where: { storeId, productType: { not: null } }, distinct: ["productType"], select: { productType: true }, take: 100 }),
    prisma.product.findMany({ where: { storeId, vendor: { not: null } }, distinct: ["vendor"], select: { vendor: true }, take: 100 }),
    prisma.productVariant.findMany({ where: { product: { storeId } }, distinct: ["title"], select: { title: true }, take: 2000 }),
    prisma.product.findMany({ where: { storeId, tags: { not: null } }, select: { tags: true }, take: 2000 }),
  ]);
  const { sizes, colours } = sizesAndColours(variants.map((v) => v.title));
  const tags = new Map();
  for (const row of tagRows) {
    for (const t of String(row.tags || "").split(",").map((x) => x.trim()).filter(Boolean)) {
      const k = t.toLowerCase();
      if (!tags.has(k)) tags.set(k, t);
    }
  }
  const byText = (a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
  return {
    productTypes: types.map((t) => t.productType).filter(Boolean).sort(byText),
    vendors: vendors.map((v) => v.vendor).filter(Boolean).sort(byText),
    sizes: sortSizes(sizes),
    colours: colours.sort(byText),
    tags: [...tags.values()].sort(byText).slice(0, 300),
  };
}

const SIZE_ORDER = ["xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "2xl", "3xl", "4xl", "5xl", "free size", "freesize", "one size", "onesize"];
function sortSizes(list) {
  const rank = (v) => {
    const i = SIZE_ORDER.indexOf(String(v).toLowerCase());
    if (i !== -1) return [0, i];
    const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? [1, n] : [2, 0];
  };
  return list.sort((a, b) => {
    const [ga, va] = rank(a);
    const [gb, vb] = rank(b);
    return ga - gb || va - vb || String(a).localeCompare(String(b));
  });
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

module.exports = {
  unitsSold,
  facets, list, findById, findBySlug, count, create, update, remove };
