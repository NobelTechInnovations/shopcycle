const { storeSettings } = require("../../lib/store-settings");

/** The Home page: what needs doing, recent orders, the setup guide. Sales
 * and traffic come from /api/analytics/overview (the page's range picker). */
async function getOverview(prisma, store, user) {
  const storeId = store.id;
  const threshold = storeSettings(store).lowStockThreshold;
  const liveVariants = { product: { storeId, status: { not: "archived" } } };
  const [productCount, recentOrders, activeTheme, collectionCount, shippingZoneCount, toFulfill, unpaid, outOfStock, lowStock, mandates] =
    await Promise.all([
      prisma.product.count({ where: { storeId } }),
      prisma.order.findMany({
        where: { storeId },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.theme.findFirst({ where: { storeId, isActive: true }, select: { name: true } }),
      prisma.collection.count({ where: { storeId } }),
      prisma.shippingZone.count({ where: { storeId } }),
      prisma.order.count({ where: { storeId, fulfillmentStatus: { in: ["unfulfilled", "partially_fulfilled"] } } }),
      prisma.order.count({ where: { storeId, paymentStatus: "pending", fulfillmentStatus: { not: "cancelled" } } }),
      prisma.productVariant.count({ where: { ...liveVariants, inventoryQuantity: { lte: 0 } } }),
      prisma.productVariant.count({ where: { ...liveVariants, inventoryQuantity: { gt: 0, lte: threshold } } }),
      prisma.mandate.count({ where: { storeId, status: { in: ["active", "pending"] } } }),
    ]);

  return {
    greetingName: (user?.name || "").trim().split(/\s+/)[0] || null,
    store: { name: store.name, handle: store.handle, domain: store.domain },
    todo: { toFulfill, unpaid, outOfStock, lowStock, lowStockThreshold: threshold },
    recentOrders,
    storeStatus: {
      themeName: activeTheme?.name || null,
      themeActive: Boolean(activeTheme),
    },
    // Drives the dashboard's setup guide. Every flag is derived from real
    // data — never a "dismissed" or "visited" marker — so a step can only
    // show as done once the store is actually in that state.
    setup: {
      hasProduct: productCount > 0,
      hasCollection: collectionCount > 0,
      hasShipping: shippingZoneCount > 0,
      // Done once the subscription is paid, or autopay is set up to pay it.
      hasPlan: ["ACTIVE", "CANCEL_SCHEDULED"].includes(store.subscription?.status) || mandates > 0,
      hasDomain: Boolean(store.domain),
    },
  };
}

module.exports = { getOverview };
