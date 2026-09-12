const billingService = require("../billing/service");

/** Public endpoint — Razorpay, not a logged-in user, calls this. Trust is
 * established entirely by the signature header (see verifyWebhookSignature),
 * never by anything else in the request. Always replies 200 once the
 * signature checks out, even if the event itself is one we ignore
 * (see handleWebhookEvent) — Razorpay retries on anything but 2xx, and
 * retrying an event we intentionally don't act on would just be noise. */
async function razorpayWebhookHandler(request, reply) {
  const signature = request.headers["x-razorpay-signature"];
  if (!signature || !billingService.verifyWebhookSignature(request.rawBody, signature)) {
    reply.code(400).send({ error: "Invalid signature" });
    return;
  }

  await billingService.handleWebhookEvent(request.server.prisma, request.body);
  reply.send({ ok: true });
}

module.exports = { razorpayWebhookHandler };
