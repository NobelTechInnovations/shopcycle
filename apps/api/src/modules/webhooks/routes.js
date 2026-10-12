const controller = require("./controller");
const { env } = require("../../config/env");
const inbound = require("../whatsapp/inbound");
const whatsappEvents = require("../whatsapp/events");

/** Registered with its own plugin scope (see app.js) specifically so this
 * custom JSON content-type parser — which keeps the raw bytes around for
 * signature verification — only applies to this route, not every other
 * JSON body in the app. Fastify's default JSON parser discards the raw
 * buffer once parsed, which is fine everywhere else but would make HMAC
 * verification here impossible (the signature is computed over the exact
 * bytes Razorpay sent, not over a re-serialized copy of the parsed object —
 * those two are not guaranteed to be byte-identical). */
async function webhookRoutes(fastify) {
  fastify.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    request.rawBody = body;
    try {
      done(null, body.length ? JSON.parse(body) : {});
    } catch (err) {
      done(err, undefined);
    }
  });

  fastify.post("/razorpay", controller.razorpayWebhookHandler);

  // WhatsApp Business Platform (Meta app ▸ WhatsApp ▸ Configuration).
  // GET: Meta's one-time check of the verify token. POST: events, signed
  // with the app secret (X-Hub-Signature-256) over the raw body.
  fastify.get("/meta/whatsapp", async (request, reply) => {
    const q = request.query || {};
    if (q["hub.mode"] === "subscribe" && env.META_WEBHOOK_VERIFY_TOKEN && q["hub.verify_token"] === env.META_WEBHOOK_VERIFY_TOKEN) {
      return reply.type("text/plain").send(String(q["hub.challenge"] || ""));
    }
    return reply.code(403).send({ error: "Verification failed" });
  });
  fastify.post("/meta/whatsapp", { config: { rateLimit: false } }, async (request, reply) => {
    if (!inbound.verifySignature(request.rawBody, request.headers["x-hub-signature-256"])) {
      return reply.code(401).send({ error: "Invalid signature" });
    }
    try {
      await inbound.processWebhook(fastify.prisma, request.body, { log: request.log, onReceived: whatsappEvents.onReceived(fastify) });
    } catch (err) {
      // Meta retries non-200s; every event is idempotent, so a retry is safe.
      request.log.error({ err }, "whatsapp webhook: processing failed");
      return reply.code(500).send({ error: "Processing failed" });
    }
    return reply.send({ ok: true });
  });
}

module.exports = webhookRoutes;
