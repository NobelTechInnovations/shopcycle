async function getOverview(prisma, store, user) {
  const storeId = store.id;
  const [orderAgg, orderCount, productCount, recentOrders, activeTheme, collectionCount, shippingZoneCount, customerCount] =
    await Promise.all([
      prisma.order.aggregate({ where: { storeId }, _sum: { total: true } }),
      prisma.order.count({ where: { storeId } }),
      prisma.product.count({ where: { storeId } }),
      prisma.order.findMany({
        where: { storeId },
        include: { customer: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.theme.findFirst({ where: { storeId, isActive: true } }),
      prisma.collection.count({ where: { storeId } }),
      prisma.shippingZone.count({ where: { storeId } }),
      prisma.customer.count({ where: { storeId } }),
    ]);

  return {
    greetingName: (user?.name || "").trim().split(/\s+/)[0] || null,
    store: { name: store.name, handle: store.handle, domain: store.domain },
    stats: {
      sales: orderAgg._sum.total || 0,
      orders: orderCount,
      products: productCount,
      customers: customerCount,
    },
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
      hasPlan:
        ["ACTIVE", "CANCEL_SCHEDULED"].includes(store.subscription?.status) ||
        (await prisma.mandate.count({ where: { storeId, status: { in: ["active", "pending"] } } })) > 0,
      hasDomain: Boolean(store.domain),
    },
  };
}

module.exports = { getOverview };
