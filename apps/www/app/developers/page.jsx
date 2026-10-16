import Link from "next/link";
import { Icon, I } from "../components/Icon";
import { APP_URL, API_URL } from "../components/site";

export const metadata = {
  title: "API docs",
  description: "The Oyklane REST API and webhooks: connect your store to a CRM, ERP, accounting or any tool. Products, inventory, orders and customers, with signed webhooks.",
};

const BASE = `${API_URL}/api/v1`;

const SCOPES = [
  ["read_products", "Read products, categories and collections"],
  ["write_products", "Create, edit and delete products, categories and collections"],
  ["read_inventory", "Read stock levels"],
  ["write_inventory", "Change stock levels"],
  ["read_orders", "Read orders"],
  ["write_orders", "Ship orders (add tracking)"],
  ["import_orders", "Import past orders (no payment, stock or messages)"],
  ["read_customers", "Read customers"],
  ["write_customers", "Create and edit customers"],
  ["read_discounts", "Read discounts"],
  ["write_discounts", "Create discounts"],
];

const ENDPOINTS = [
  ["GET", "/shop", "—", "Your store: name, handle, currency, time zone, domain."],
  ["GET", "/products", "read_products", "Products, newest first. Filters: status, q (title or SKU), sku, handle, external_id, updated_since."],
  ["GET", "/products/{id}", "read_products", "One product with its variants and images."],
  ["POST", "/products", "write_products", "Create a product. category by name (made if new), images copied into your Files, externalId to import safely."],
  ["PATCH", "/products/{id}", "write_products", "Change a product — send only the fields that change."],
  ["DELETE", "/products/{id}", "write_products", "Delete a product."],
  ["GET", "/categories", "read_products", "Categories. Filters: name, external_id."],
  ["POST", "/categories", "write_products", "Create a category (name, image, externalId) — or get the one with that name."],
  ["GET", "/collections", "read_products", "Collections with their product ids. Filter: external_id."],
  ["POST", "/collections", "write_products", "Create a collection with productIds or productExternalIds."],
  ["GET", "/inventory", "read_inventory", "Stock for every variant (variant_id, sku, quantity)."],
  ["POST", "/inventory/adjust", "write_inventory", "Add to or set a variant's stock, with a reason."],
  ["GET", "/orders", "read_orders", "Orders, newest first. Filters: payment_status, fulfillment_status, created_since, external_id, updated_since."],
  ["GET", "/orders/{id}", "read_orders", "One order with line items, address and totals."],
  ["POST", "/orders/{id}/fulfillments", "write_orders", "Ship items: courier, tracking number and link; the shopper is emailed."],
  ["POST", "/orders/import", "import_orders", "Record a past order from another platform, with its date and number. No payment, stock change, messages or fees."],
  ["GET", "/customers", "read_customers", "Customers, newest first. Filters: email, phone, external_id, updated_since."],
  ["GET", "/customers/{id}", "read_customers", "One customer."],
  ["POST", "/customers", "write_customers", "Create a customer — or fill in the one with that externalId, email or phone."],
  ["PATCH", "/customers/{id}", "write_customers", "Change a customer."],
  ["GET", "/discounts", "read_discounts", "Discounts. Filters: code, external_id."],
  ["POST", "/discounts", "write_discounts", "Create a discount code — or get the one with that code or externalId."],
];

const EVENTS = [
  ["order.created", "A new order was placed"],
  ["order.paid", "An order was paid"],
  ["order.fulfilled", "Items were shipped"],
  ["order.delivered", "An order was delivered"],
  ["order.cancelled", "An order was cancelled"],
  ["order.refunded", "An order was refunded (fully or partly)"],
  ["product.created", "A product was created"],
  ["product.updated", "A product was changed"],
  ["product.deleted", "A product was deleted"],
  ["customer.created", "A new customer was added"],
];

const TOC = [
  ["start", "Get started"],
  ["auth", "Authentication"],
  ["requests", "Requests and pagination"],
  ["endpoints", "Endpoints"],
  ["example", "Example: an order"],
  ["webhooks", "Webhooks"],
  ["verify", "Verifying a webhook"],
  ["crm", "Connect a CRM"],
  ["import", "Move a store to Oyklane"],
  ["mcp", "AI agents (MCP)"],
  ["errors", "Errors and limits"],
];

const ORDER_EXAMPLE = `{
  "data": {
    "id": "cm8x2k…",
    "number": 1043,
    "email": "ananya@example.com",
    "phone": "+919876543210",
    "currency": "INR",
    "subtotal": 2199,
    "shipping": 100,
    "tax": 0,
    "total": 2299,
    "payment_method": "razorpay",
    "payment_status": "paid",
    "fulfillment_status": "unfulfilled",
    "gstin": null,
    "customer": { "id": "cm8w9q…", "name": "Ananya Sharma", "email": "ananya@example.com" },
    "shipping_address": { "name": "Ananya Sharma", "address1": "12 MG Road", "city": "Bengaluru", "province": "Karnataka", "zip": "560001", "country": "India" },
    "line_items": [
      { "id": "cm8x2m…", "product_id": "cm7…", "variant_id": "cm7…", "title": "Pure Linen Shirt — M", "quantity": 1, "price": 2199, "total": 2199 }
    ]
  }
}`;

const VERIFY = `import crypto from "node:crypto";

// Express: keep the raw body — the signature is over the exact bytes.
app.post("/oyklane-webhook", express.raw({ type: "application/json" }), (req, res) => {
  const ts = req.get("x-oyklane-timestamp");
  const sig = req.get("x-oyklane-signature"); // "sha256=…"
  const expected = "sha256=" + crypto
    .createHmac("sha256", process.env.OYKLANE_WEBHOOK_SECRET) // whsec_…
    .update(\`\${ts}.\${req.body}\`)
    .digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(ts)) < 300;
  if (!fresh || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.sendStatus(401);
  }
  const event = req.get("x-oyklane-event"); // e.g. "order.paid"
  const payload = JSON.parse(req.body);
  // …send it to your CRM, then answer quickly:
  res.sendStatus(200);
});`;

function Code({ children, label }) {
  return (
    <figure className="docs__code">
      {label && <figcaption>{label}</figcaption>}
      <pre>
        <code>{children}</code>
      </pre>
    </figure>
  );
}

/** The public API, for anyone connecting a store to their own tools. */
export default function DevelopersPage() {
  return (
    <>
      <section className="hero hero--page">
        <div className="wrap">
          <span className="icon-tile"><Icon d={I.code} /></span>
          <h1 className="h1" style={{ marginTop: 20 }}>Oyklane API</h1>
          <p className="lead">
            Connect your store to a CRM, ERP, accounting software, a warehouse or your own app. Read and update products, stock, orders and customers over REST, and get
            signed webhooks the moment something happens.
          </p>
          <div className="hero__ctas">
            <a href={`${APP_URL}/admin/settings/api`} className="btn btn--primary btn--lg">Create an API key</a>
            <a href="#crm" className="btn btn--ghost btn--lg">Connect a CRM</a>
          </div>
          <ul className="proof">
            <li><Icon d={I.check} /> REST and JSON</li>
            <li><Icon d={I.check} /> Signed webhooks with retries</li>
            <li><Icon d={I.check} /> Keys with only the access you choose</li>
          </ul>
        </div>
      </section>

      <section className="wrap docs">
        <nav className="docs__toc" aria-label="On this page">
          <p>On this page</p>
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`}>{label}</a>
          ))}
        </nav>

        <article className="docs__body">
          <h2 id="start" className="h2">Get started</h2>
          <ol className="docs__steps">
            <li>
              <b>Create a key.</b> In your dashboard, open <b>Settings ▸ API &amp; webhooks</b> and click <b>Create key</b>. Name it after the tool (&ldquo;Zoho CRM&rdquo;) and tick only
              the permissions it needs. API keys are part of the Pro plan.
            </li>
            <li>
              <b>Copy it once.</b> The key starts with <code>oyk_</code> and is shown only when it&apos;s created — keep it in your tool&apos;s settings or a secrets manager, never in a
              web page.
            </li>
            <li>
              <b>Make a call.</b> Every request goes to <code>{BASE}</code>.
            </li>
          </ol>
          <Code label="Your first request">{`curl ${BASE}/shop \\
  -H "Authorization: Bearer oyk_your_key"`}</Code>

          <h2 id="auth" className="h2">Authentication</h2>
          <p>
            Send the key in the <code>Authorization</code> header as <code>Bearer oyk_…</code> (or in <code>X-Oyklane-Key</code>). A key only reaches its own store, and only
            what its permissions allow — a request outside them gets <code>403</code>. Revoke a key any time from the same settings page; it stops working immediately.
          </p>
          <div className="docs__table">
            <table>
              <thead>
                <tr><th>Permission</th><th>Allows</th></tr>
              </thead>
              <tbody>
                {SCOPES.map(([k, v]) => (
                  <tr key={k}><td><code>{k}</code></td><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 id="requests" className="h2">Requests and pagination</h2>
          <p>
            Requests and responses are JSON. Lists return the newest first, 50 at a time: pass <code>?page=2&amp;limit=100</code> (100 at most). Every list answers with{" "}
            <code>{"{ data, page, limit, total }"}</code>. To sync only what changed, pass <code>updated_since</code> with the time of your last sync (ISO 8601, e.g.{" "}
            <code>2026-10-01T00:00:00+05:30</code>). Amounts are in rupees (or the store&apos;s currency), not paise.
          </p>
          <Code label="Paid orders changed since your last sync">{`curl "${BASE}/orders?payment_status=paid&updated_since=2026-10-01T00:00:00%2B05:30&limit=100" \\
  -H "Authorization: Bearer oyk_your_key"`}</Code>

          <h2 id="endpoints" className="h2">Endpoints</h2>
          <div className="docs__table">
            <table>
              <thead>
                <tr><th>Method</th><th>Path</th><th>Permission</th><th>What it does</th></tr>
              </thead>
              <tbody>
                {ENDPOINTS.map(([m, path, scope, text]) => (
                  <tr key={`${m} ${path}`}>
                    <td><span className={`docs__method docs__method--${m.toLowerCase()}`}>{m}</span></td>
                    <td><code>{path}</code></td>
                    <td>{scope === "—" ? "any key" : <code>{scope}</code>}</td>
                    <td>{text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Code label="Ship an order and email the tracking link">{`curl -X POST ${BASE}/orders/ORDER_ID/fulfillments \\
  -H "Authorization: Bearer oyk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "courier": "Delhivery", "tracking_number": "1234567890", "notify_customer": true }'`}</Code>
          <Code label="Set a variant's stock from your warehouse">{`curl -X POST ${BASE}/inventory/adjust \\
  -H "Authorization: Bearer oyk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "variant_id": "VARIANT_ID", "mode": "set", "quantity": 42, "reason": "received" }'`}</Code>

          <h2 id="example" className="h2">Example: an order</h2>
          <Code label="GET /orders/{id}">{ORDER_EXAMPLE}</Code>

          <h2 id="webhooks" className="h2">Webhooks</h2>
          <p>
            Instead of asking every few minutes, let Oyklane tell you. In <b>Settings ▸ API &amp; webhooks</b>, add an endpoint (an <code>https://</code> URL of your server or
            your CRM&apos;s webhook URL) and pick its events. Oyklane sends a <code>POST</code> with the JSON body (the same shape as the API) within seconds.
          </p>
          <div className="docs__table">
            <table>
              <thead>
                <tr><th>Event</th><th>When</th></tr>
              </thead>
              <tbody>
                {EVENTS.map(([k, v]) => (
                  <tr key={k}><td><code>{k}</code></td><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Answer with any <code>2xx</code> within 10 seconds. Anything else is retried after 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours. Every delivery is listed in
            your settings with its response, and you can send one again or send a test.
          </p>

          <h2 id="verify" className="h2">Verifying a webhook</h2>
          <p>Each request carries these headers. Check the signature before trusting the body, and ignore anything older than five minutes.</p>
          <div className="docs__table">
            <table>
              <tbody>
                <tr><td><code>x-oyklane-event</code></td><td>The event, e.g. <code>order.paid</code></td></tr>
                <tr><td><code>x-oyklane-delivery</code></td><td>A unique id — use it to ignore a repeat</td></tr>
                <tr><td><code>x-oyklane-timestamp</code></td><td>Unix seconds when it was sent</td></tr>
                <tr><td><code>x-oyklane-signature</code></td><td><code>sha256=</code> + HMAC-SHA256 of <code>{"{timestamp}.{raw body}"}</code> with your endpoint&apos;s secret (<code>whsec_…</code>)</td></tr>
              </tbody>
            </table>
          </div>
          <Code label="Node.js (Express)">{VERIFY}</Code>

          <h2 id="crm" className="h2">Connect a CRM</h2>
          <p>The same four steps work for Zoho CRM, HubSpot, Salesforce, LeadSquared, Freshsales — or Zapier and Make if you&apos;d rather not write code.</p>
          <ol className="docs__steps">
            <li>
              <b>Create a key</b> with <code>read_orders</code> and <code>read_customers</code> (add <code>write_orders</code> if your CRM or warehouse should add tracking).
            </li>
            <li>
              <b>Add a webhook</b> for <code>customer.created</code>, <code>order.paid</code> and <code>order.fulfilled</code>. Point it at your server — or at the &ldquo;catch
              hook&rdquo; URL Zapier or Make gives you.
            </li>
            <li>
              <b>Map the fields.</b> Customer → contact (name, email, phone); order → deal or sale (number, total, status, line items). Use the customer&apos;s <code>id</code> as
              the external id so repeats update instead of duplicating.
            </li>
            <li>
              <b>Backfill once.</b> Page through <code>/customers</code> and <code>/orders</code> to bring in history; after that, webhooks keep the CRM up to date. A nightly call
              with <code>updated_since</code> catches anything a busy CRM missed.
            </li>
          </ol>

          <h2 id="import" className="h2">Move a store to Oyklane</h2>
          <p>
            Bring a whole store across — from Shopify or anywhere — with one key that has <code>write_products</code>, <code>write_customers</code>, <code>write_discounts</code>{" "}
            and <code>import_orders</code>. Send each record&apos;s id from the old store as <code>externalId</code> (e.g. <code>shopify:8123</code>): it&apos;s unique in your store, so
            running the import again finds what it already made (<code>&quot;created&quot;: false</code>) instead of duplicating it.
          </p>
          <ol className="docs__steps">
            <li><b>Categories</b> — <code>POST /categories</code> with a name. Or skip them and send <code>category</code> by name on each product.</li>
            <li><b>Products</b> — image URLs are copied into your Files, so nothing depends on the old store. Variants are named by their option values, e.g. <code>M / Red</code>.</li>
            <li><b>Collections</b> — link products with <code>productExternalIds</code>.</li>
            <li><b>Customers</b> — matched by externalId, email, then phone; a match is only filled in, never overwritten.</li>
            <li><b>Discounts</b> — imported codes stay off product pages unless you send <code>showOnStore: true</code>.</li>
            <li><b>Past orders</b> — <code>POST /orders/import</code> keeps the date and number. Nothing a new order sets off happens: no payment, stock change, emails, WhatsApp, webhooks or Oyklane fees.</li>
          </ol>
          <Code label="Import a past order">{`curl -X POST ${BASE}/orders/import \\
  -H "Authorization: Bearer oyk_…" -H "Content-Type: application/json" \\
  -d '{"externalId":"shopify:5012","number":1042,"createdAt":"2026-03-02T10:15:00+05:30",
       "email":"asha@example.com","paymentMethod":"prepaid","paymentStatus":"paid",
       "fulfillmentStatus":"fulfilled","shipping":49,"total":548,
       "customer":{"name":"Asha Rao","phone":"+919876543210"},
       "shippingAddress":{"name":"Asha Rao","address1":"12 MG Road","city":"Bengaluru","province":"Karnataka","zip":"560001","country":"India"},
       "lineItems":[{"title":"Lakadong Turmeric 250g","sku":"TUR-250","quantity":2,"price":249.5,"productExternalId":"shopify:771"}],
       "courier":"Delhivery","trackingNumber":"1234567890"}'`}</Code>

          <h2 id="mcp" className="h2">AI agents (MCP)</h2>
          <p>
            The same API is available as a Model Context Protocol server at <code>{API_URL}/api/mcp</code>, so AI assistants can look up orders, products and stock with your
            key — with the same permissions and limits.
          </p>

          <h2 id="errors" className="h2">Errors and limits</h2>
          <div className="docs__table">
            <table>
              <thead>
                <tr><th>Status</th><th>Meaning</th></tr>
              </thead>
              <tbody>
                <tr><td><code>400</code></td><td>Something in the request isn&apos;t valid — the <code>error</code> field says what.</td></tr>
                <tr><td><code>401</code></td><td>No key, or the key was revoked.</td></tr>
                <tr><td><code>403</code></td><td>The key doesn&apos;t have the permission this needs.</td></tr>
                <tr><td><code>404</code></td><td>Not found in this store.</td></tr>
                <tr><td><code>429</code></td><td>More than 240 requests a minute with this key — wait a moment and retry.</td></tr>
              </tbody>
            </table>
          </div>
          <p className="muted">
            Questions about the API? Ask the Help assistant in your dashboard. Building a theme or an app for other stores? See the{" "}
            <Link href="/integrations" className="link-arrow">integrations guide</Link>.
          </p>
        </article>
      </section>
    </>
  );
}
