const service = require("./service");

/**
 * POST /api/public/upi-sms/:token — an SMS-forwarder app on the seller's
 * phone sends each bank SMS here (JSON, a form, or plain text). The token
 * is the store's secret (Apps ▸ UPI QR ▸ Automatic confirmation).
 */
async function upiSmsRoutes(fastify) {
  // Forwarder apps post forms as often as JSON.
  fastify.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body)));
  });
  const limit = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } }, bodyLimit: 16 * 1024 };
  fastify.post("/:token", limit, async (request) => service.receiveSms(fastify.prisma, request.params.token, request.body, { log: request.log }));
}

module.exports = upiSmsRoutes;
