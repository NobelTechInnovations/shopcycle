async function getOverview(prisma, storeId) {
  const [orderAgg, orderCount, productCount, recentOrders, activeTheme] = await Promise.all([
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
  ]);

  return {
    stats: {
      sales: orderAgg._sum.total || 0,
      orders: orderCount,
      products: productCount,
    },
    recentOrders,
    storeStatus: {
      themeName: activeTheme?.name || null,
      themeActive: Boolean(activeTheme),
    },
  };
}

module.exports = { getOverview };
