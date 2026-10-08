const { PLACED, PROVIDER_KEYS } = require("../orders/placed");
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
 * spot in the module that drops to raw SQL — PostgreSQL-specific (matches
 * the datasource in schema.prisma), not meant to be swapped to another DB
 * without revisiting this query. Column names are double-quoted because
 * the schema maps tables to snake_case but leaves columns camelCase, and
 * Postgres folds unquoted identifiers to lowercase. */
// Days are the store's own calendar days (its timezone), not UTC ones —
// an order at 11pm in India belongs to that day, not the next.
const dayRows = (rows, key = "count") => rows.map((r) => ({ date: new Date(r.date).toISOString().slice(0, 10), [key]: Number(r[key]) }));

async function sessionsPerDay(prisma, storeId, from, to, tz = "Asia/Kolkata") {
  const rows = await prisma.$queryRaw`
    SELECT (("firstSeenAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date as date, COUNT(*) as count
    FROM visitor_sessions
    WHERE "storeId" = ${storeId} AND "firstSeenAt" >= ${from} AND "firstSeenAt" < ${to}
    GROUP BY 1 ORDER BY 1 ASC
  `;
  return dayRows(rows);
}

async function pageViewsPerDay(prisma, storeId, from, to, tz = "Asia/Kolkata") {
  const rows = await prisma.$queryRaw`
    SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date as date, COUNT(*) as count
    FROM page_views
    WHERE "storeId" = ${storeId} AND "createdAt" >= ${from} AND "createdAt" < ${to}
    GROUP BY 1 ORDER BY 1 ASC
  `;
  return dayRows(rows);
}

/** Orders and sales per day — cancelled orders, and online checkouts that
 * were never paid (orders/placed.js), don't count as sales. */
async function salesPerDay(prisma, storeId, from, to, tz = "Asia/Kolkata") {
  const rows = await prisma.$queryRaw`
    SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date as date, COUNT(*) as orders, COALESCE(SUM("total"), 0) as revenue
    FROM orders
    WHERE "storeId" = ${storeId} AND "createdAt" >= ${from} AND "createdAt" < ${to} AND "fulfillmentStatus" <> 'cancelled'
      AND NOT ("paymentStatus" = 'pending' AND "paymentMethod" = ANY(${PROVIDER_KEYS}))
      AND NOT ("paymentStatus" = 'pending' AND "paymentMethod" = 'upi_qr' AND "paymentReference" IS NULL)
    GROUP BY 1 ORDER BY 1 ASC
  `;
  return rows.map((r) => ({ date: new Date(r.date).toISOString().slice(0, 10), orders: Number(r.orders), revenue: Number(r.revenue) }));
}

/** Totals for a period: sessions, page views, orders and sales. */
async function periodTotals(prisma, storeId, from, to) {
  const [sessions, pageViews, orders] = await Promise.all([
    prisma.visitorSession.count({ where: { storeId, firstSeenAt: { gte: from, lt: to } } }),
    prisma.pageView.count({ where: { storeId, createdAt: { gte: from, lt: to } } }),
    prisma.order.aggregate({ where: { storeId, createdAt: { gte: from, lt: to }, fulfillmentStatus: { not: "cancelled" }, ...PLACED }, _count: { _all: true }, _sum: { total: true } }),
  ]);
  return { sessions, pageViews, orders: orders._count._all, sales: Number(orders._sum.total || 0) };
}

async function topProducts(prisma, storeId, from, to) {
  const rows = await prisma.$queryRaw`
    SELECT oi."title" as title, SUM(oi."quantity") as quantity, SUM(oi."total") as revenue
    FROM order_items oi
    JOIN orders o ON o."id" = oi."orderId"
    WHERE o."storeId" = ${storeId} AND o."createdAt" >= ${from} AND o."createdAt" < ${to} AND o."fulfillmentStatus" <> 'cancelled'
      AND NOT (o."paymentStatus" = 'pending' AND o."paymentMethod" = ANY(${PROVIDER_KEYS}))
      AND NOT (o."paymentStatus" = 'pending' AND o."paymentMethod" = 'upi_qr' AND o."paymentReference" IS NULL)
    GROUP BY oi."title"
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
  topPaths,
  sessionsByCountry,
  sessionsByDevice,
  sessionsBySource,
  sessionsPerDay,
  pageViewsPerDay,
  salesPerDay,
  periodTotals,
  topProducts,
  listCampaigns,
  findCampaignById,
  createCampaign,
  deleteCampaign,
  sessionIdsForCampaign,
  ordersForSessions,
};
