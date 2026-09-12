const controller = require("./controller");

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
}

module.exports = webhookRoutes;
