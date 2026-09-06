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

module.exports = { slugify, formatCurrency, asyncHandler, HttpError, detectDeviceType };
