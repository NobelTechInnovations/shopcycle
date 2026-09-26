/**
 * A minimal stand-in for the Razorpay REST API — just the endpoints the
 * platform uses — so billing can be tested end to end without real keys.
 * Point the API at it with RAZORPAY_API_URL=http://localhost:<port>/v1.
 * Every call is recorded; GET /__calls returns them for assertions.
 */
const http = require("http");

function startRazorpayMock(port) {
  const calls = [];
  const subscriptions = new Map();
  let seq = 0;
  const id = (prefix) => `${prefix}_mock${Date.now().toString(36)}${(seq += 1)}`;

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

      if (req.method === "GET" && url === "/__calls") return send(200, calls);
      calls.push({ method: req.method, path: url, body });

      if (!String(req.headers.authorization || "").startsWith("Basic ")) {
        return send(401, { error: { description: "Authentication failed" } });
      }
      if (req.method === "POST" && url === "/v1/plans") return send(200, { id: id("plan"), ...body });
      if (req.method === "POST" && url === "/v1/orders") {
        return send(200, { id: id("order"), amount: body.amount, currency: body.currency || "INR", receipt: body.receipt });
      }
      if (req.method === "POST" && url === "/v1/subscriptions") {
        const sub = { id: id("sub"), status: "created", ...body };
        subscriptions.set(sub.id, sub);
        return send(200, sub);
      }
      let m;
      if ((m = url.match(/^\/v1\/subscriptions\/([^/]+)$/)) && req.method === "GET") {
        const sub = subscriptions.get(decodeURIComponent(m[1]));
        return sub ? send(200, sub) : send(400, { error: { description: "The id provided does not exist" } });
      }
      if ((m = url.match(/^\/v1\/subscriptions\/([^/]+)$/)) && req.method === "PATCH") {
        return send(200, { id: m[1], ...body });
      }
      if ((m = url.match(/^\/v1\/subscriptions\/([^/]+)\/cancel_scheduled_changes$/)) && req.method === "POST") {
        return send(200, { id: m[1], has_scheduled_changes: false });
      }
      if ((m = url.match(/^\/v1\/subscriptions\/([^/]+)\/addons$/)) && req.method === "POST") {
        return send(200, { id: id("ao"), subscription_id: m[1], item: body.item, quantity: body.quantity });
      }
      return send(404, { error: { description: `Mock has no route for ${req.method} ${url}` } });
    });
  });

  return new Promise((resolve) => server.listen(port, () => resolve({ server, calls })));
}

module.exports = { startRazorpayMock };
