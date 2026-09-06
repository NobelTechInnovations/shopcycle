function getStoreByHandle(prisma, handle) {
  return prisma.store.findUnique({ where: { handle } });
}

function getStoreByDomain(prisma, domain) {
  return prisma.store.findUnique({ where: { domain } });
}

function getActiveTheme(prisma, storeId) {
  return prisma.theme.findFirst({
    where: { storeId, isActive: true },
    include: { files: true },
  });
}

/** Any theme belonging to the store, active or not — used for Phase 3
 * preview, where an admin may be looking at a theme that isn't live. */
function getThemeById(prisma, storeId, themeId) {
  return prisma.theme.findFirst({
    where: { id: themeId, storeId },
    include: { files: true },
  });
}

const activeProductInclude = {
  variants: { where: { status: "active" }, orderBy: { createdAt: "asc" } },
  images: { orderBy: { position: "asc" } },
};

function getAllActiveProducts(prisma, storeId) {
  return prisma.product.findMany({
    where: { storeId, status: "active" },
    include: activeProductInclude,
  });
}

function getProductBySlug(prisma, storeId, slug) {
  return prisma.product.findFirst({
    where: { storeId, slug, status: "active" },
    include: activeProductInclude,
  });
}

function getAllActiveCollections(prisma, storeId) {
  return prisma.collection.findMany({
    where: { storeId, status: "active" },
    include: {
      products: {
        orderBy: { position: "asc" },
        include: { product: { include: activeProductInclude } },
      },
    },
  });
}

function getCollectionBySlug(prisma, storeId, slug) {
  return prisma.collection.findFirst({
    where: { storeId, slug, status: "active" },
    include: {
      products: {
        orderBy: { position: "asc" },
        include: { product: { include: activeProductInclude } },
      },
    },
  });
}

function getMenus(prisma, storeId) {
  return prisma.menu.findMany({ where: { storeId }, include: { items: { orderBy: { position: "asc" } } } });
}

function getActivePageBySlug(prisma, storeId, slug) {
  return prisma.page.findFirst({ where: { storeId, slug, status: "active" } });
}

module.exports = {
  getStoreByHandle,
  getStoreByDomain,
  getActiveTheme,
  getThemeById,
  getAllActiveProducts,
  getProductBySlug,
  getAllActiveCollections,
  getCollectionBySlug,
  getMenus,
  getActivePageBySlug,
};
