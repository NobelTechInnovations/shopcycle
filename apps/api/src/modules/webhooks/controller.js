const billingWebhooks = require("../billing/webhooks");

/** Public endpoint — Razorpay, not a logged-in user, calls this. Trust
 * comes only from the signature (billing/webhooks.js). Each event is
 * stored once by its id before it's applied, so Razorpay's retries are
 * acknowledged without being applied twice; an event that fails half-way
 * is replayed by the billing engine. Anything but a bad signature is
 * answered 200, so Razorpay doesn't keep retrying events we don't use. */
async function razorpayWebhookHandler(request, reply) {
  const result = await billingWebhooks.receive(request.server.prisma, "razorpay", {
    body: request.body,
    headers: request.headers,
    rawBody: request.rawBody,
    log: request.log,
  });
  reply.send(result);
}

module.exports = { razorpayWebhookHandler };
