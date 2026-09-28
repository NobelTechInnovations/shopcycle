const { HttpError, detectDeviceType } = require("@shopcycle/utils");
const storefrontService = require("../storefront/service");
const repository = require("./repository");

const SESSION_STALE_MS = 30 * 60 * 1000; // 30 minutes of inactivity ends a session
const LIVE_TTL_SECONDS = 90; // a visitor with no page view in 90s drops off Live View

const RANGE_DAYS = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
const DAY_MS = 86400000;

/** "YYYY-MM-DD" of `date` in the store's timezone. */
function dayKey(date, tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** The UTC instant of midnight on `day` ("YYYY-MM-DD") in `tz`. */
function midnight(day, tz) {
  const [y, m, d] = day.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(guess)
      .map((x) => [x.type, x.value])
  );
  const offset = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - guess.getTime();
  return new Date(guess.getTime() - offset);
}

/** The range's whole days in the store's timezone, today included
 * ("7d" = today and the 6 days before), plus the same-length period right
 * before it for comparison. */
function rangeToDates(range, tz = "Asia/Kolkata") {
  const days = RANGE_DAYS[range] ?? 7;
  const today = dayKey(new Date(), tz);
  const from = new Date(midnight(today, tz).getTime() - (days - 1) * DAY_MS);
  const to = new Date(midnight(today, tz).getTime() + DAY_MS);
  const dates = Array.from({ length: days }, (_, i) => dayKey(new Date(from.getTime() + i * DAY_MS + DAY_MS / 2), tz));
  return { from, to, days, dates, prevFrom: new Date(from.getTime() - days * DAY_MS), prevTo: from };
}

const round2 = (n) => Math.round(n * 100) / 100;

function kpis({ sessions, pageViews, orders, sales }) {
  return {
    sessions,
    pageViews,
    orders,
    sales: round2(sales),
    aov: orders ? round2(sales / orders) : 0,
    conversionRate: sessions ? round2(Math.min(100, (orders / sessions) * 100)) : 0,
  };
}

/** No GeoIP database is bundled (and this app never calls a third-party
 * IP-lookup service automatically — that would send every anonymous
 * visitor's IP to an outside company with no consent). Several hosts
 * inject the visitor's country as a free edge header instead; read those
 * if present, otherwise the visitor's country is honestly "Unknown"
 * rather than guessed. Deploying behind Cloudflare or Vercel makes this
 * start working with zero code changes. */
function countryFromHeaders(headers) {
  return (
    headers["cf-ipcountry"] ||
    headers["x-vercel-ip-country"] ||
    headers["x-appengine-country"] ||
    null
  );
}

function liveKey(storeId, sessionId) {
  return `analytics:live:${storeId}:${sessionId}`;
}

async function markLive(redis, storeId, session, path) {
  const payload = {
    sessionId: session.id,
    path,
    country: session.country,
    deviceType: session.deviceType,
    customerName: session.customerName || null,
    updatedAt: new Date().toISOString(),
  };
  await redis.set(liveKey(storeId, session.id), JSON.stringify(payload), "EX", LIVE_TTL_SECONDS);
}

async function getLiveVisitors(redis, storeId) {
  const pattern = `analytics:live:${storeId}:*`;
  const keys = [];
  let cursor = "0";
  do {
    const [next, found] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    keys.push(...found);
  } while (cursor !== "0");

  if (keys.length === 0) return [];
  const values = await redis.mget(...keys);
  return values
    .filter(Boolean)
    .map((v) => JSON.parse(v))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * Called once per real storefront page render (never from the theme
 * editor's draft preview — see storefront/controller.js for where this is
 * and isn't invoked). Resolves or starts a session, records the page
 * view, and refreshes the Live View entry.
 */
async function trackPageView(prisma, redis, handle, { sessionId, path, templateName, referrer, utm, userAgent, headers }) {
  const store = await storefrontService.loadStoreOrThrow(prisma, handle);

  let session = sessionId ? await repository.findSession(prisma, store.id, sessionId) : null;
  const isStale = session && Date.now() - new Date(session.lastSeenAt).getTime() > SESSION_STALE_MS;

  if (!session || isStale) {
    session = await repository.createSession(prisma, store.id, {
      country: countryFromHeaders(headers || {}),
      deviceType: detectDeviceType(userAgent),
      userAgent: userAgent || null,
      referrer: referrer || null,
      utmSource: utm?.source || null,
      utmMedium: utm?.medium || null,
      utmCampaign: utm?.campaign || null,
      utmTerm: utm?.term || null,
      utmContent: utm?.content || null,
      entryPath: path,
    });
  } else {
    session = await repository.touchSession(prisma, session.id, { lastSeenAt: new Date() });
  }

  await repository.createPageView(prisma, store.id, session.id, path, templateName || null);

  let customerName = null;
  if (session.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: session.customerId }, select: { name: true } });
    customerName = customer?.name || null;
  }
  await markLive(redis, store.id, { ...session, customerName }, path);

  return session.id;
}

async function getOverview(prisma, storeId, range) {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { timezone: true } });
  const tz = store?.timezone || "Asia/Kolkata";
  const { from, to, dates, prevFrom, prevTo } = rangeToDates(range, tz);

  const [current, previous, topPathRows, countryRows, deviceRows, sourceRows, sessionsPerDay, pageViewsPerDay, salesPerDay, topProductRows] = await Promise.all([
    repository.periodTotals(prisma, storeId, from, to),
    repository.periodTotals(prisma, storeId, prevFrom, prevTo),
    repository.topPaths(prisma, storeId, from, to),
    repository.sessionsByCountry(prisma, storeId, from, to),
    repository.sessionsByDevice(prisma, storeId, from, to),
    repository.sessionsBySource(prisma, storeId, from, to),
    repository.sessionsPerDay(prisma, storeId, from, to, tz),
    repository.pageViewsPerDay(prisma, storeId, from, to, tz),
    repository.salesPerDay(prisma, storeId, from, to, tz),
    repository.topProducts(prisma, storeId, from, to),
  ]);

  const byCount = (a, b) => b.count - a.count;
  const at = (rows) => Object.fromEntries(rows.map((r) => [r.date, r]));
  const [sess, views, sales] = [at(sessionsPerDay), at(pageViewsPerDay), at(salesPerDay)];

  return {
    range,
    timezone: tz,
    totals: kpis(current),
    previous: kpis(previous),
    // Every day of the range, zeros included, so charts don't skip days.
    series: dates.map((date) => ({
      date,
      sessions: sess[date]?.count || 0,
      pageViews: views[date]?.count || 0,
      orders: sales[date]?.orders || 0,
      sales: round2(sales[date]?.revenue || 0),
    })),
    topPaths: topPathRows
      .map((r) => ({ path: r.path, count: r._count._all }))
      .sort(byCount)
      .slice(0, 8),
    byCountry: countryRows.map((r) => ({ country: r.country || "Unknown", count: r._count._all })).sort(byCount),
    byDevice: deviceRows.map((r) => ({ device: r.deviceType, count: r._count._all })).sort(byCount),
    bySource: sourceRows
      .map((r) => ({ source: r.utmSource || "Direct / none", medium: r.utmMedium, count: r._count._all }))
      .sort(byCount)
      .slice(0, 8),
    topProducts: topProductRows.sort((a, b) => b.revenue - a.revenue).slice(0, 6),
  };
}

async function getReports(prisma, storeId, range) {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { timezone: true } });
  const tz = store?.timezone || "Asia/Kolkata";
  const { from, to, dates } = rangeToDates(range, tz);
  const [salesRows, topProductRows, sourceRows] = await Promise.all([
    repository.salesPerDay(prisma, storeId, from, to, tz),
    repository.topProducts(prisma, storeId, from, to),
    repository.sessionsBySource(prisma, storeId, from, to),
  ]);

  const byCount = (a, b) => b.count - a.count;
  const byDate = Object.fromEntries(salesRows.map((r) => [r.date, r]));
  const salesPerDay = dates.map((date) => ({ date, orders: byDate[date]?.orders || 0, revenue: round2(byDate[date]?.revenue || 0) }));
  const totalRevenue = salesPerDay.reduce((sum, r) => sum + r.revenue, 0);
  const totalOrders = salesPerDay.reduce((sum, r) => sum + r.orders, 0);

  return {
    range,
    timezone: tz,
    totals: { revenue: round2(totalRevenue), orders: totalOrders },
    salesPerDay,
    topProducts: topProductRows.sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    bySource: sourceRows
      .map((r) => ({ source: r.utmSource || "Direct / none", medium: r.utmMedium, count: r._count._all }))
      .sort(byCount)
      .slice(0, 8),
  };
}

async function listCampaigns(prisma, storeId, routes) {
  const campaigns = await repository.listCampaigns(prisma, storeId);
  return Promise.all(
    campaigns.map(async (campaign) => {
      const sessionIds = await repository.sessionIdsForCampaign(prisma, storeId, campaign);
      const orders = await repository.ordersForSessions(prisma, sessionIds);
      return {
        ...campaign,
        url: buildCampaignUrl(routes, campaign),
        stats: {
          sessions: sessionIds.length,
          orders: orders.length,
          revenue: orders.reduce((sum, o) => sum + Number(o.total), 0),
        },
      };
    })
  );
}

function buildCampaignUrl(rootUrl, campaign) {
  // `new URL(path, base)` treats a leading "/" in `path` as absolute —
  // it replaces base's own path (/store/:handle) instead of appending to
  // it, which silently dropped the store segment here. Concatenating
  // instead keeps rootUrl's path intact for the common "/" (homepage) case
  // and still supports a real sub-path destination like "/collections/all".
  const suffix = campaign.destinationPath && campaign.destinationPath !== "/" ? campaign.destinationPath : "";
  const url = new URL(`${rootUrl}${suffix}`);
  url.searchParams.set("utm_source", campaign.utmSource);
  url.searchParams.set("utm_medium", campaign.utmMedium);
  url.searchParams.set("utm_campaign", campaign.utmCampaign);
  if (campaign.utmTerm) url.searchParams.set("utm_term", campaign.utmTerm);
  if (campaign.utmContent) url.searchParams.set("utm_content", campaign.utmContent);
  return url.toString();
}

async function createCampaign(prisma, storeId, input) {
  return repository.createCampaign(prisma, storeId, input);
}

async function deleteCampaign(prisma, storeId, id) {
  const campaign = await repository.findCampaignById(prisma, storeId, id);
  if (!campaign) throw new HttpError(404, "Campaign not found");
  await repository.deleteCampaign(prisma, id);
}

module.exports = {
  trackPageView,
  getLiveVisitors,
  getOverview,
  getReports,
  listCampaigns,
  createCampaign,
  deleteCampaign,
  buildCampaignUrl,
};
