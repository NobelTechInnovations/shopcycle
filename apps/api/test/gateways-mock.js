/**
 * Stand-ins for the Cashfree, Stripe and PayPal APIs — just what checkout
 * uses — so seller payment gateways can be tested end to end. A test
 * "pays" with POST /__pay/<provider>/<ref> (what the shopper would do on
 * the gateway's page).
 */
const http = require("http");

function startGatewaysMock(port) {
  const orders = new Map(); // ref -> { provider, amount, paid, ...}
  let seq = 0;
  const id = (p) => `${p}_${Date.now().toString(36)}${(seq += 1)}`;

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const ctype = req.headers["content-type"] || "";
      const body = !raw ? {} : ctype.includes("json") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
      const send = (status, data) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
      };
      const url = req.url.split("?")[0];
      let m;

      if (req.method === "POST" && (m = url.match(/^\/__pay\/(\w+)\/(.+)$/))) {
        const o = orders.get(decodeURIComponent(m[2]));
        if (!o) return send(404, {});
        o.paid = true;
        return send(200, { ok: true });
      }

      // Cashfree
      if (url.startsWith("/pg/")) {
        if (req.headers["x-client-secret"] !== "cf_secret_ok") return send(401, { message: "authentication Failed" });
        if (req.method === "POST" && url === "/pg/orders") {
          orders.set(body.order_id, { provider: "cashfree", amount: body.order_amount, paid: false });
          return send(200, { order_id: body.order_id, payment_session_id: id("session"), order_status: "ACTIVE" });
        }
        if (req.method === "GET" && (m = url.match(/^\/pg\/orders\/(.+)$/))) {
          const o = orders.get(decodeURIComponent(m[1]));
          if (!o) return send(404, { message: "order not found" });
          return send(200, { order_id: m[1], cf_order_id: 12345, order_amount: o.amount, order_status: o.paid ? "PAID" : "ACTIVE" });
        }
      }

      // PayPal
      if (req.method === "POST" && url === "/v1/oauth2/token") {
        const auth = Buffer.from(String(req.headers.authorization || "").replace("Basic ", ""), "base64").toString();
        return auth === "pp_client:pp_secret" ? send(200, { access_token: "pp_token" }) : send(401, { error: "invalid_client" });
      }

      // Stripe
      if (url.startsWith("/v1/")) {
        if (req.headers.authorization !== "Bearer sk_test_ok") return send(401, { error: { message: "Invalid API Key provided" } });
        if (req.method === "GET" && url === "/v1/balance") return send(200, { object: "balance" });
        if (req.method === "POST" && url === "/v1/checkout/sessions") {
          const sid = id("cs_test");
          orders.set(sid, { provider: "stripe", amount: Number(body["line_items[0][price_data][unit_amount]"]), ref: body.client_reference_id, paid: false });
          return send(200, { id: sid, url: `https://checkout.stripe.test/pay/${sid}` });
        }
        if (req.method === "GET" && (m = url.match(/^\/v1\/checkout\/sessions\/(.+)$/))) {
          const o = orders.get(decodeURIComponent(m[1]));
          if (!o) return send(404, { error: { message: "No such session" } });
          return send(200, { id: m[1], payment_status: o.paid ? "paid" : "unpaid", client_reference_id: o.ref, amount_total: o.amount, payment_intent: "pi_mock_1" });
        }
      }

      // PayPal
      if (url.startsWith("/v2/")) {
        if (req.headers.authorization !== "Bearer pp_token") return send(401, {});
        if (req.method === "POST" && url === "/v2/checkout/orders") {
          const oid = id("PPORDER");
          orders.set(oid, { provider: "paypal", amount: body.purchase_units[0].amount.value, paid: false, captured: false });
          return send(201, { id: oid, status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: `https://www.sandbox.paypal.test/checkoutnow?token=${oid}` }] });
        }
        if (req.method === "POST" && (m = url.match(/^\/v2\/checkout\/orders\/(.+)\/capture$/))) {
          const o = orders.get(decodeURIComponent(m[1]));
          if (!o) return send(404, {});
          if (!o.paid) return send(422, { details: [{ issue: "ORDER_NOT_APPROVED" }] });
          if (o.captured) return send(422, { details: [{ issue: "ORDER_ALREADY_CAPTURED" }] });
          o.captured = true;
          return send(201, { id: m[1], status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAPTURE1", amount: { value: o.amount } }] } }] });
        }
      }
      return send(404, { message: `mock: no route for ${req.method} ${url}` });
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server })));
}

module.exports = { startGatewaysMock };
