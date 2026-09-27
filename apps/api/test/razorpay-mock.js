/**
 * A minimal stand-in for the Razorpay REST API — the endpoints Oyklane's
 * billing uses (customers, orders, recurring tokens, recurring payments,
 * refunds) plus the old Subscriptions endpoints — so billing can be tested
 * end to end without real keys. Point the API at it with
 * RAZORPAY_API_URL=http://localhost:<port>/v1.
 *
 * Test-only helpers (no auth):
 *   GET  /__calls                      every call made, for assertions
 *   POST /__pay     { order_id, method, fail }   the shopper completes
 *        Checkout: creates the payment (and a token for a mandate order)
 *   POST /__settle  { payment_id, status, reason }  a recurring debit's
 *        outcome (the bank answers later in real life)
 *   POST /__token   { token_id, status }         a token changes state
 *   GET  /__payment/:id                          the payment entity
 */
const http = require("http");

function startRazorpayMock(port) {
  const calls = [];
  const subscriptions = new Map();
  const orders = new Map();
  const payments = new Map();
  const tokens = new Map();
  let seq = 0;
  const id = (prefix) => `${prefix}_mock${Date.now().toString(36)}${(seq += 1)}`;

  function paymentEntity(p) {
    const t = p.token_id ? tokens.get(p.token_id) : null;
    return {
      id: p.id,
      entity: "payment",
      amount: p.amount,
      currency: "INR",
      status: p.status,
      order_id: p.order_id,
      method: p.method,
      token_id: p.token_id || null,
      customer_id: p.customer_id || null,
      recurring: Boolean(p.recurring),
      error_code: p.status === "failed" ? "BAD_REQUEST_ERROR" : null,
      error_description: p.status === "failed" ? p.reason || "Payment declined by the bank" : null,
      notes: p.notes || {},
      ...(p.method === "card" && { card: { network: "Visa", last4: "4242" } }),
      ...(p.method === "upi" && { vpa: "seller@okhdfc" }),
      ...(t && p.method === "emandate" && { bank: "HDFC" }),
    };
  }

  function tokenEntity(t) {
    return {
      id: t.id,
      entity: "token",
      method: t.method,
      recurring: t.status === "confirmed",
      recurring_details: { status: t.status, failure_reason: t.status === "rejected" ? "Rejected by bank" : null },
      max_amount: t.max_amount,
      expired_at: t.expire_at,
      customer_id: t.customer_id,
      ...(t.method === "card" && { card: { network: "Visa", last4: "4242" } }),
      ...(t.method === "upi" && { vpa: { username: "seller", handle: "okhdfc" } }),
      ...(t.method === "emandate" && { bank: "HDFC" }),
    };
  }

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      const url = req.url;
      const send = (status, data) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
      };
      let m;

      // ── test helpers ──
      if (req.method === "GET" && url === "/__calls") return send(200, calls);
      if (req.method === "POST" && url === "/__pay") {
        const order = orders.get(body.order_id);
        if (!order) return send(404, { error: "no such order" });
        const method = body.method || order.method || "upi";
        let tokenId = null;
        if (order.token) {
          tokenId = id("token");
          tokens.set(tokenId, {
            id: tokenId,
            method,
            customer_id: order.customer_id,
            max_amount: order.token.max_amount,
            expire_at: order.token.expire_at,
            status: body.tokenStatus || (method === "emandate" ? "initiated" : "confirmed"),
          });
        }
        const p = { id: id("pay"), order_id: order.id, amount: order.amount, method, token_id: tokenId, customer_id: order.customer_id, status: body.fail ? "failed" : "captured", reason: body.reason, notes: order.notes };
        payments.set(p.id, p);
        return send(200, { payment_id: p.id, token_id: tokenId, payment: paymentEntity(p) });
      }
      if (req.method === "POST" && url === "/__settle") {
        const p = payments.get(body.payment_id);
        if (!p) return send(404, { error: "no such payment" });
        p.status = body.status;
        p.reason = body.reason;
        return send(200, paymentEntity(p));
      }
      if (req.method === "POST" && url === "/__token") {
        const t = tokens.get(body.token_id);
        if (!t) return send(404, { error: "no such token" });
        t.status = body.status;
        return send(200, tokenEntity(t));
      }
      if ((m = url.match(/^\/__payment\/([^/]+)$/)) && req.method === "GET") {
        const p = payments.get(decodeURIComponent(m[1]));
        return p ? send(200, paymentEntity(p)) : send(404, {});
      }

      calls.push({ method: req.method, path: url, body });
      if (!String(req.headers.authorization || "").startsWith("Basic ")) {
        return send(401, { error: { description: "Authentication failed" } });
      }

      // ── customers & tokens ──
      if (req.method === "POST" && url === "/v1/customers") return send(200, { id: id("cust"), entity: "customer", ...body });
      if ((m = url.match(/^\/v1\/customers\/([^/]+)\/tokens\/([^/]+)$/))) {
        const t = tokens.get(decodeURIComponent(m[2]));
        if (!t) return send(400, { error: { code: "BAD_REQUEST_ERROR", description: "The token does not exist" } });
        if (req.method === "GET") return send(200, tokenEntity(t));
        if (req.method === "DELETE") {
          t.status = "cancelled";
          return send(200, { deleted: true });
        }
      }

      // ── orders & payments ──
      if (req.method === "POST" && url === "/v1/orders") {
        const order = { id: id("order"), entity: "order", amount: body.amount, currency: body.currency || "INR", receipt: body.receipt, customer_id: body.customer_id || null, method: body.method || null, token: body.token || null, notes: body.notes || {} };
        orders.set(order.id, order);
        return send(200, order);
      }
      if (req.method === "POST" && url === "/v1/payments/create/recurring") {
        const t = tokens.get(body.token);
        if (!t || t.status !== "confirmed") return send(400, { error: { code: "BAD_REQUEST_ERROR", description: "The token is not active" } });
        const p = { id: id("pay"), order_id: body.order_id, amount: body.amount, method: t.method, token_id: t.id, customer_id: body.customer_id, status: "created", recurring: true, notes: body.notes || {} };
        payments.set(p.id, p);
        return send(200, { razorpay_payment_id: p.id, razorpay_order_id: body.order_id, razorpay_signature: "mock" });
      }
      if ((m = url.match(/^\/v1\/payments\/([^/]+)\/refund$/)) && req.method === "POST") {
        const p = payments.get(decodeURIComponent(m[1]));
        if (!p) return send(400, { error: { description: "The id provided does not exist" } });
        return send(200, { id: id("rfnd"), entity: "refund", amount: body.amount, payment_id: p.id, status: "processed" });
      }
      if ((m = url.match(/^\/v1\/payments\/([^/]+)$/)) && req.method === "GET") {
        const p = payments.get(decodeURIComponent(m[1]));
        return p ? send(200, paymentEntity(p)) : send(400, { error: { description: "The id provided does not exist" } });
      }

      // ── older Subscriptions endpoints (kept for completeness) ──
      if (req.method === "POST" && url === "/v1/plans") return send(200, { id: id("plan"), ...body });
      if (req.method === "POST" && url === "/v1/subscriptions") {
        const sub = { id: id("sub"), status: "created", ...body };
        subscriptions.set(sub.id, sub);
        return send(200, sub);
      }
      if ((m = url.match(/^\/v1\/subscriptions\/([^/]+)$/)) && req.method === "GET") {
        const sub = subscriptions.get(decodeURIComponent(m[1]));
        return sub ? send(200, sub) : send(400, { error: { description: "The id provided does not exist" } });
      }
      return send(404, { error: { description: `mock: no route for ${req.method} ${url}` } });
    });
  });

  return new Promise((resolve) => server.listen(port, () => resolve({ server, calls, payments, tokens, orders, paymentEntity, tokenEntity })));
}

module.exports = { startRazorpayMock };
