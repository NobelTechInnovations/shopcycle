const keys = require("./api-keys");

/**
 * /api/mcp — the store as an MCP server (Model Context Protocol), so an AI
 * agent (Claude, ChatGPT, Cursor, n8n…) can work with it: look up and edit
 * products, stock, orders and customers. Streamable HTTP transport,
 * stateless: each POST carries JSON-RPC messages, each answer is JSON.
 *
 * Authenticated with the store's API key (Settings ▸ API & webhooks):
 *   Authorization: Bearer oyk_…
 * Every tool runs the matching /api/v1 call with that same key, so the
 * key's permissions, the plan check, validation and rate limits are exactly
 * the public API's. tools/list shows only what the key may do.
 */

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER = { name: "oyklane-store", title: "Oyklane store", version: "1.0.0" };

const page = {
  page: { type: "integer", minimum: 1, description: "Page number (default 1)." },
  limit: { type: "integer", minimum: 1, maximum: 100, description: "Results per page (default 50, max 100)." },
};
const variantSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "Size/colour name, e.g. \"M\" or \"Red / M\". Use \"Default\" for a single variant." },
    price: { type: "number", description: "Selling price in the store's currency." },
    comparePrice: { type: "number", description: "Original price (MRP), shown struck through." },
    sku: { type: "string" },
    inventoryQuantity: { type: "integer", description: "Opening stock." },
  },
  required: ["title", "price"],
};
const productFields = {
  title: { type: "string" },
  description: { type: "string", description: "HTML or plain text." },
  status: { type: "string", enum: ["active", "draft", "archived"] },
  vendor: { type: "string" },
  productType: { type: "string" },
  tags: { type: "string", description: "Comma-separated." },
  images: { type: "array", items: { type: "object", properties: { url: { type: "string" }, altText: { type: "string" } }, required: ["url"] } },
  variants: { type: "array", items: variantSchema },
};

/** name → { scope, description, input, call(args) → [method, path, body?], annotations } */
const TOOLS = {
  get_store: {
    scope: null,
    description: "The store's name, address, currency and timezone.",
    input: {},
    call: () => ["GET", "/shop"],
    annotations: { readOnlyHint: true },
  },
  list_products: {
    scope: "read_products",
    description: "List products, newest first. Filter by status or search the title/SKU with `query`.",
    input: { query: { type: "string", description: "Words in the title, or a SKU." }, status: { type: "string", enum: ["active", "draft", "archived"] }, ...page },
    call: (a) => ["GET", `/products?${qs({ q: a.query, status: a.status, page: a.page, limit: a.limit })}`],
    annotations: { readOnlyHint: true },
  },
  get_product: {
    scope: "read_products",
    description: "One product with its variants (prices, SKUs, stock) and images.",
    input: { id: { type: "string", description: "Product id." } },
    required: ["id"],
    call: (a) => ["GET", `/products/${enc(a.id)}`],
    annotations: { readOnlyHint: true },
  },
  create_product: {
    scope: "write_products",
    description: "Create a product. Give at least a title and one variant with a price. New products are drafts unless status is \"active\".",
    input: productFields,
    required: ["title", "variants"],
    call: (a) => ["POST", "/products", a],
  },
  update_product: {
    scope: "write_products",
    description: "Change a product's title, description, status, tags, images or variants. Only the fields given change. When sending variants, send the full list with each existing variant's id (from get_product) — variants left out are removed.",
    input: { id: { type: "string" }, ...productFields },
    required: ["id"],
    call: ({ id, ...rest }) => ["PATCH", `/products/${enc(id)}`, rest],
  },
  delete_product: {
    scope: "write_products",
    description: "Delete a product permanently. Past orders keep their line items.",
    input: { id: { type: "string" } },
    required: ["id"],
    call: (a) => ["DELETE", `/products/${enc(a.id)}`],
    annotations: { destructiveHint: true },
  },
  list_inventory: {
    scope: "read_inventory",
    description: "Stock level of every variant (with SKU and product), most recently changed first.",
    input: { ...page },
    call: (a) => ["GET", `/inventory?${qs({ page: a.page, limit: a.limit })}`],
    annotations: { readOnlyHint: true },
  },
  adjust_inventory: {
    scope: "write_inventory",
    description: "Change a variant's stock: add (or subtract with a negative number) or set an exact quantity.",
    input: {
      variant_id: { type: "string" },
      quantity: { type: "integer" },
      mode: { type: "string", enum: ["add", "set"], description: "add (default) or set." },
      reason: { type: "string", enum: ["received", "correction", "damaged", "returned", "other"] },
      note: { type: "string" },
    },
    required: ["variant_id", "quantity"],
    call: (a) => ["POST", "/inventory/adjust", a],
  },
  list_orders: {
    scope: "read_orders",
    description: "List orders, newest first, with items, totals, customer and payment/fulfilment status.",
    input: {
      payment_status: { type: "string", enum: ["pending", "paid", "partially_refunded", "refunded"] },
      fulfillment_status: { type: "string", description: "e.g. unfulfilled, partially_fulfilled, fulfilled." },
      created_since: { type: "string", description: "ISO date-time, e.g. 2026-10-01T00:00:00+05:30." },
      ...page,
    },
    call: (a) => ["GET", `/orders?${qs({ payment_status: a.payment_status, fulfillment_status: a.fulfillment_status, created_since: a.created_since, page: a.page, limit: a.limit })}`],
    annotations: { readOnlyHint: true },
  },
  get_order: {
    scope: "read_orders",
    description: "One order in full: items, prices, taxes, shipping address, payments and shipments.",
    input: { id: { type: "string", description: "Order id." } },
    required: ["id"],
    call: (a) => ["GET", `/orders/${enc(a.id)}`],
    annotations: { readOnlyHint: true },
  },
  fulfill_order: {
    scope: "write_orders",
    description: "Mark items of an order as shipped, with the courier and tracking number. Leave items empty to ship everything left. The customer is told unless notify_customer is false.",
    input: {
      id: { type: "string", description: "Order id." },
      items: { type: "array", items: { type: "object", properties: { line_item_id: { type: "string" }, quantity: { type: "integer" } }, required: ["line_item_id", "quantity"] } },
      courier: { type: "string" },
      tracking_number: { type: "string" },
      tracking_url: { type: "string" },
      notify_customer: { type: "boolean" },
    },
    required: ["id"],
    call: ({ id, ...rest }) => ["POST", `/orders/${enc(id)}/fulfillments`, rest],
  },
  list_customers: {
    scope: "read_customers",
    description: "List customers, newest first, or find one by exact email.",
    input: { email: { type: "string" }, ...page },
    call: (a) => ["GET", `/customers?${qs({ email: a.email, page: a.page, limit: a.limit })}`],
    annotations: { readOnlyHint: true },
  },
  get_customer: {
    scope: "read_customers",
    description: "One customer's details.",
    input: { id: { type: "string" } },
    required: ["id"],
    call: (a) => ["GET", `/customers/${enc(a.id)}`],
    annotations: { readOnlyHint: true },
  },
};

const enc = (v) => encodeURIComponent(String(v ?? ""));
function qs(params) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") out.set(k, String(v));
  return out.toString();
}

function toolList(scopes) {
  return Object.entries(TOOLS)
    .filter(([, t]) => !t.scope || scopes.includes(t.scope))
    .map(([name, t]) => ({
      name,
      title: name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      description: t.description,
      inputSchema: { type: "object", properties: t.input, ...(t.required && { required: t.required }), additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, ...t.annotations },
    }));
}

const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function mcpRoutes(fastify) {
  // The same key check as /api/v1 (no particular scope — tools check theirs).
  const auth = keys.requireScope(fastify, null);
  const limit = { rateLimit: { max: 240, timeWindow: "1 minute", keyGenerator: (req) => String(req.headers.authorization || req.headers["x-oyklane-key"] || req.ip) } };

  async function callTool(request, name, args) {
    const tool = TOOLS[name];
    if (!tool) return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    if (tool.scope && !request.apiKey.scopes.includes(tool.scope)) {
      return { isError: true, content: [{ type: "text", text: `This API key doesn't have the ${tool.scope} permission. Add it in Settings ▸ API & webhooks.` }] };
    }
    const [method, path, body] = tool.call(args || {});
    const res = await fastify.inject({
      method,
      url: `/api/v1${path}`,
      headers: { authorization: request.headers.authorization || `Bearer ${request.headers["x-oyklane-key"] || ""}`, ...(body && { "content-type": "application/json" }) },
      ...(body && { payload: JSON.stringify(body) }),
    });
    let data;
    try {
      data = JSON.parse(res.body);
    } catch {
      data = { error: res.body };
    }
    if (res.statusCode >= 400) {
      const detail = data?.details ? ` ${JSON.stringify(data.details)}` : "";
      return { isError: true, content: [{ type: "text", text: `${data?.error || `HTTP ${res.statusCode}`}${detail}` }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
  }

  async function handle(request, msg) {
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(msg?.id, -32600, "Invalid request");
    const isNotification = msg.id === undefined || msg.id === null;
    const ok = (result) => (isNotification ? null : { jsonrpc: "2.0", id: msg.id, result });
    switch (msg.method) {
      case "initialize": {
        const asked = msg.params?.protocolVersion;
        return ok({
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER,
          instructions: `You're connected to the Oyklane store "${request.store.name}" (${request.store.currency}). Prices are in the store's currency. Ask before deleting anything or changing many products at once.`,
        });
      }
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: toolList(request.apiKey.scopes) });
      case "tools/call": {
        const name = msg.params?.name;
        if (!TOOLS[name]) return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
        return ok(await callTool(request, name, msg.params?.arguments));
      }
      default:
        return isNotification ? null : rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  }

  fastify.post("/", { config: limit, preHandler: auth }, async (request, reply) => {
    const body = request.body;
    const batch = Array.isArray(body);
    const messages = batch ? body : [body];
    if (!messages.length) return reply.code(400).send(rpcError(null, -32600, "Empty batch"));
    const out = [];
    for (const m of messages) {
      const r = await handle(request, m).catch((err) => rpcError(m?.id, -32603, err.message || "Internal error"));
      if (r) out.push(r);
    }
    // Only notifications: nothing to answer.
    if (!out.length) return reply.code(202).send();
    return reply.header("content-type", "application/json").send(batch ? out : out[0]);
  });

  // No server-to-client stream: this server only answers requests.
  fastify.get("/", async (request, reply) => reply.code(405).header("allow", "POST").send({ error: "Use POST with JSON-RPC messages (MCP Streamable HTTP)." }));
  fastify.delete("/", async (request, reply) => reply.code(405).header("allow", "POST").send({ error: "This MCP server keeps no sessions." }));
}

module.exports = mcpRoutes;
module.exports.TOOLS = TOOLS;
