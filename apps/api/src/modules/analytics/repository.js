function findSession(prisma, storeId, id) {
  return prisma.visitorSession.findFirst({ where: { id, storeId } });
}

function createSession(prisma, storeId, data) {
  return prisma.visitorSession.create({ data: { ...data, storeId } });
}

function touchSession(prisma, id, data) {
  return prisma.visitorSession.update({ where: { id }, data });
}

function createPageView(prisma, storeId, sessionId, path, templateName) {
  return prisma.pageView.create({ data: { storeId, sessionId, path, templateName } });
}

function countSessions(prisma, storeId, from, to) {
  return prisma.visitorSession.count({ where: { storeId, firstSeenAt: { gte: from, lte: to } } });
}

function countPageViews(prisma, storeId, from, to) {
  return prisma.pageView.count({ where: { storeId, createdAt: { gte: from, lte: to } } });
}

// `_count: { <field>: true }` counts non-null occurrences of that field —
// wrong for grouping on a nullable column, where the whole point is often
// counting the null ("Unknown country", "Direct / none source") bucket
// too. `_count: { _all: true }` counts rows in the group regardless, which
// is what every one of these breakdowns actually wants. Prisma's groupBy
// `orderBy` doesn't accept `_all` as a sort key (verified against the
// actual client — it throws), so these come back unordered and the
// service layer sorts + slices the (small) result sets itself.

function topPaths(prisma, storeId, from, to) {
  return prisma.pageView.groupBy({
    by: ["path"],
    where: { storeId, createdAt: { gte: from, lte: to } },
    _count: { _all: true },
  });
}

function sessionsByCountry(prisma, storeId, from, to) {
  return prisma.visitorSession.groupBy({
    by: ["country"],
    where: { storeId, firstSeenAt: { gte: from, lte: to } },
    _count: { _all: true },
  });
}

function sessionsByDevice(prisma, storeId, from, to) {
  return prisma.visitorSession.groupBy({
    by: ["deviceType"],
    where: { storeId, firstSeenAt: { gte: from, lte: to } },
    _count: { _all: true },
  });
}

function sessionsBySource(prisma, storeId, from, to) {
  return prisma.visitorSession.groupBy({
    by: ["utmSource", "utmMedium"],
    where: { storeId, firstSeenAt: { gte: from, lte: to } },
    _count: { _all: true },
  });
}

/** Prisma's groupBy has no portable date-truncation, so this is the one
 * spot in the module that drops to raw SQL — MySQL-specific (matches the
 * datasource in schema.prisma), not meant to be swapped to another DB
 * without revisiting this query. */
async function sessionsPerDay(prisma, storeId, from, to) {
  const rows = await prisma.$queryRaw`
    SELECT DATE(firstSeenAt) as date, COUNT(*) as count
    FROM visitor_sessions
    WHERE storeId = ${storeId} AND firstSeenAt >= ${from} AND firstSeenAt <= ${to}
    GROUP BY DATE(firstSeenAt)
    ORDER BY date ASC
  `;
  return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
}

async function pageViewsPerDay(prisma, storeId, from, to) {
  const rows = await prisma.$queryRaw`
    SELECT DATE(createdAt) as date, COUNT(*) as count
    FROM page_views
    WHERE storeId = ${storeId} AND createdAt >= ${from} AND createdAt <= ${to}
    GROUP BY DATE(createdAt)
    ORDER BY date ASC
  `;
  return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
}

async function salesPerDay(prisma, storeId, from, to) {
  const rows = await prisma.$queryRaw`
    SELECT DATE(createdAt) as date, COUNT(*) as orders, SUM(total) as revenue
    FROM orders
    WHERE storeId = ${storeId} AND createdAt >= ${from} AND createdAt <= ${to}
    GROUP BY DATE(createdAt)
    ORDER BY date ASC
  `;
  return rows.map((r) => ({ date: r.date, orders: Number(r.orders), revenue: Number(r.revenue) }));
}

async function topProducts(prisma, storeId, from, to) {
  const rows = await prisma.$queryRaw`
    SELECT oi.title as title, SUM(oi.quantity) as quantity, SUM(oi.total) as revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.orderId
    WHERE o.storeId = ${storeId} AND o.createdAt >= ${from} AND o.createdAt <= ${to}
    GROUP BY oi.title
    ORDER BY revenue DESC
  `;
  return rows.map((r) => ({ title: r.title, quantity: Number(r.quantity), revenue: Number(r.revenue) }));
}

function listCampaigns(prisma, storeId) {
  return prisma.campaign.findMany({ where: { storeId }, orderBy: { createdAt: "desc" } });
}

function findCampaignById(prisma, storeId, id) {
  return prisma.campaign.findFirst({ where: { id, storeId } });
}

function createCampaign(prisma, storeId, data) {
  return prisma.campaign.create({ data: { ...data, storeId } });
}

function deleteCampaign(prisma, id) {
  return prisma.campaign.delete({ where: { id } });
}

function sessionIdsForCampaign(prisma, storeId, campaign) {
  return prisma.visitorSession
    .findMany({
      where: {
        storeId,
        utmSource: campaign.utmSource,
        utmMedium: campaign.utmMedium,
        utmCampaign: campaign.utmCampaign,
      },
      select: { id: true },
    })
    .then((rows) => rows.map((r) => r.id));
}

function ordersForSessions(prisma, sessionIds) {
  if (sessionIds.length === 0) return Promise.resolve([]);
  return prisma.order.findMany({ where: { sessionId: { in: sessionIds } }, select: { total: true } });
}

module.exports = {
  findSession,
  createSession,
  touchSession,
  createPageView,
  countSessions,
  countPageViews,
  topPaths,
  sessionsByCountry,
  sessionsByDevice,
  sessionsBySource,
  sessionsPerDay,
  pageViewsPerDay,
  salesPerDay,
  topProducts,
  listCampaigns,
  findCampaignById,
  createCampaign,
  deleteCampaign,
  sessionIdsForCampaign,
  ordersForSessions,
};
