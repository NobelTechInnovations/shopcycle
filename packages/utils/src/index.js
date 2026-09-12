function slugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatCurrency(amount, currency = "INR") {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value || 0);
}

/** Wraps an async Fastify handler so thrown errors reach the error handler
 * instead of becoming unhandled rejections. */
function asyncHandler(fn) {
  return async (request, reply) => {
    try {
      return await fn(request, reply);
    } catch (err) {
      request.log.error(err);
      throw err;
    }
  };
}

class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

/** Deliberately not a full UA-parsing library (no new dependency for three
 * buckets) — order matters: tablet patterns are checked before the
 * broader "Mobi" substring they'd otherwise also match (an iPad's UA
 * contains neither "Mobi" nor "Tablet", but Android tablets often contain
 * "Android" without "Mobile", which is exactly the signal used below). */
function detectDeviceType(userAgent) {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  if (/ipad|android(?!.*mobile)|tablet/.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android/.test(ua)) return "mobile";
  return "desktop";
}

/** The fixed set of valid App.iconKey values — a curated whitelist rather
 * than any lucide icon name, so a super-admin's "New app" form is a short
 * dropdown and iconKey can never point at a nonexistent icon. Framework-
 * agnostic on purpose (no lucide-react/React here) so both the Zod
 * validation schema (packages/validation) and the actual icon renderer
 * (@shopcycle/ui's AppIcon, which maps each of these to a real lucide
 * component) share one source of truth instead of two lists drifting
 * apart. Add a key here first, then to AppIcon's APP_ICONS map.
 */
const APP_ICON_KEYS = [
  "bar-chart",
  "activity",
  "code",
  "star",
  "megaphone",
  "message-circle",
  "mail",
  "truck",
  "credit-card",
  "percent",
  "search",
  "puzzle",
];

module.exports = { slugify, formatCurrency, asyncHandler, HttpError, detectDeviceType, APP_ICON_KEYS };
