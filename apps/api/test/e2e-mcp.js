#!/usr/bin/env node
/**
 * End-to-end test of the store's MCP server (/api/mcp) against a real API:
 * an AI agent's session with a store API key — initialize, list the tools
 * its permissions allow, read and create products, change stock, read
 * orders; refused without a key or with a revoked one; tools outside the
 * key's permissions aren't offered or run.
 *
 *   node apps/api/test/e2e-mcp.js
 *
 * Creates a throwaway store and deletes it when done, pass or fail.
 */
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
require(path.join(ROOT, "apps/api/node_modules/dotenv")).config({ path: path.join(ROOT, ".env") });
Object.assign(process.env, { SMTP_HOST: "", EMAIL_PROVIDER: "log", SMS_PROVIDER: "log", WHATSAPP_PROVIDER: "log", MEDIA_STORAGE: "database" });

const API_PORT = 4195;
const API = `http://localhost:${API_PORT}`;
const ORIGIN = process.env.ADMIN_ORIGIN || "http://localhost:3000";

function dbUrl(limit) {
  const u = new URL(process.env.DATABASE_URL);
  if (/pooler\.supabase\.com$/.test(u.hostname) && u.port === "5432") {
    u.port = "6543";
    u.searchParams.set("pgbouncer", "true");
  }
  u.searchParams.set("connection_limit", String(limit));
  return u.toString();
}
const API_DATABASE_URL = dbUrl(4);
process.env.DATABASE_URL = dbUrl(2);

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${label}${detail !== undefined ? `  -- ${typeof detail === "string" ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)}` : ""}`);
  }
}

function client() {
  const jar = {};
  return async function call(method, url, body) {
    const res = await fetch(`${API}${url}`, {
      method,
      headers: { ...(body !== undefined && { "content-type": "application/json" }), ...(method !== "GET" && { origin: ORIGIN }), cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ") },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(";");
      const [k, ...v] = pair.split("=");
      jar[k.trim()] = v.join("=");
    }
    const text = await res.text();
    try {
      return { status: res.status, data: JSON.parse(text) };
    } catch {
      return { status: res.status, data: text };
    }
  };
}

/** One MCP request, as an agent sends it. */
async function mcp(key, message) {
  const res = await fetch(`${API}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(key && { authorization: `Bearer ${key}` }) },
    body: JSON.stringify(message),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data, type: res.headers.get("content-type") || "" };
}
let nextId = 1;
const rpc = (key, method, params) => mcp(key, { jsonrpc: "2.0", id: nextId++, method, ...(params && { params }) });
const tool = (key, name, args = {}) => rpc(key, "tools/call", { name, arguments: args });

async function startApi() {
  const child = spawn(process.execPath, [path.join(ROOT, "apps/api/src/server.js")], {
    cwd: path.join(ROOT, "apps/api"),
    env: { ...process.env, DATABASE_URL: API_DATABASE_URL, API_PORT: String(API_PORT), NODE_ENV: "test", JOBS_DISABLED: "true", SEED_PREVIEW_APPS: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${API}/health`)).ok) return { child, log: () => log };
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`API did not start:\n${log}`);
}

(async () => {
  const api = await startApi();
  const { PrismaClient } = require(path.join(ROOT, "packages/database/node_modules/@prisma/client"));
  const prisma = new PrismaClient();
  const stamp = Date.now();
  const owner = client();
  const email = `mcp-e2e-${stamp}@test.oyklane.dev`;
  let storeId = null;
  try {
    let r = await owner("POST", "/api/auth/register", { name: "MCP Tester", email, password: "correct-horse-battery", storeName: `MCP E2E ${stamp}`, plan: "growth" });
    check("register a store", r.status === 201, r.data);
    storeId = r.data.store.id;
    const pro = await prisma.plan.findFirst({ where: { key: "pro" } });
    await prisma.subscription.update({ where: { storeId }, data: { planId: pro.id } });
    await prisma.store.update({ where: { id: storeId }, data: { planId: pro.id } });
    r = await owner("POST", "/api/products", { title: "Indigo Kurta", status: "active", variants: [{ title: "M", price: 1299, sku: "IND-M", inventoryQuantity: 4 }] });
    const kurta = r.data.product;

    r = await owner("POST", "/api/developer/keys", { name: "Claude", scopes: ["read_products", "write_products", "read_inventory", "write_inventory", "read_orders"] });
    const key = r.data.token;
    r = await owner("POST", "/api/developer/keys", { name: "Read only", scopes: ["read_products"] });
    const readKey = r.data.token;

    // ── Session ──
    r = await mcp(null, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    check("no key: refused", r.status === 401, r);
    r = await rpc(key, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test-agent", version: "1" } });
    check(
      "initialize: protocol, tools capability, server info, store named in the instructions",
      r.status === 200 && r.type.includes("application/json") && r.data.result.protocolVersion === "2025-06-18" && r.data.result.capabilities.tools && r.data.result.serverInfo.name === "oyklane-store" && r.data.result.instructions.includes(`MCP E2E ${stamp}`),
      r.data
    );
    r = await rpc(key, "initialize", { protocolVersion: "1999-01-01" });
    check("an unknown protocol version gets the latest", r.data.result.protocolVersion === "2025-06-18", r.data);
    r = await mcp(key, { jsonrpc: "2.0", method: "notifications/initialized" });
    check("notifications are accepted with no body (202)", r.status === 202, r.status);
    r = await rpc(key, "ping");
    check("ping", r.status === 200 && r.data.result && Object.keys(r.data.result).length === 0, r.data);
    r = await rpc(key, "tools/list");
    const names = r.data.result.tools.map((t) => t.name);
    check(
      "tools/list: what the key may do (no order shipping, no customers)",
      names.includes("list_products") && names.includes("create_product") && names.includes("adjust_inventory") && names.includes("list_orders") && !names.includes("fulfill_order") && !names.includes("list_customers"),
      names
    );
    const create = r.data.result.tools.find((t) => t.name === "create_product");
    check("…each with a JSON schema for its arguments", create.inputSchema.type === "object" && create.inputSchema.required.includes("title"), create.inputSchema);
    check("…deleting is marked destructive", r.data.result.tools.find((t) => t.name === "delete_product").annotations.destructiveHint === true);
    r = await rpc(readKey, "tools/list");
    check("a read-only key sees only reading tools", r.data.result.tools.every((t) => t.annotations.readOnlyHint), r.data.result.tools.map((t) => t.name));

    // ── Tools ──
    r = await tool(key, "get_store");
    check("get_store", !r.data.result.isError && r.data.result.structuredContent.data.name === `MCP E2E ${stamp}`, r.data);
    r = await tool(key, "list_products", { query: "IND-M" });
    check("search products by SKU", r.data.result.structuredContent.total === 1 && r.data.result.structuredContent.data[0].title === "Indigo Kurta", r.data.result);
    check("…and the answer is also readable text", r.data.result.content[0].type === "text" && r.data.result.content[0].text.includes("Indigo Kurta"));
    r = await tool(key, "create_product", { title: "Linen Shirt", status: "active", variants: [{ title: "L", price: 1499, sku: "LIN-L", inventoryQuantity: 2 }] });
    const shirt = r.data.result.structuredContent?.data;
    check("create_product", !r.data.result.isError && shirt?.title === "Linen Shirt", r.data.result);
    const shirtRow = await prisma.product.findFirst({ where: { storeId, title: "Linen Shirt" }, include: { variants: true } });
    check("…it's really in the store", Boolean(shirtRow) && shirtRow.variants[0].sku === "LIN-L");
    r = await tool(key, "create_product", { title: "No variants" });
    check("bad arguments come back as a tool error the agent can read", r.data.result.isError === true && /variant/i.test(r.data.result.content[0].text), r.data.result);
    r = await tool(key, "adjust_inventory", { variant_id: shirtRow.variants[0].id, quantity: 5 });
    check("adjust_inventory adds stock", !r.data.result.isError && r.data.result.structuredContent.data.quantity === 7, r.data.result);
    r = await tool(key, "update_product", { id: kurta.id, status: "draft" });
    check("update_product", !r.data.result.isError && (await prisma.product.findUnique({ where: { id: kurta.id } })).status === "draft", r.data.result);
    r = await tool(key, "list_orders");
    check("list_orders", !r.data.result.isError && r.data.result.structuredContent.total === 0, r.data.result);
    r = await tool(readKey, "create_product", { title: "Sneaky", variants: [{ title: "Default", price: 1 }] });
    check("a tool outside the key's permissions isn't run", r.data.result.isError === true && /write_products/.test(r.data.result.content[0].text), r.data.result);
    check("…and nothing was created", !(await prisma.product.findFirst({ where: { storeId, title: "Sneaky" } })));
    r = await rpc(key, "tools/call", { name: "drop_tables" });
    check("an unknown tool is a JSON-RPC error", r.data.error?.code === -32602, r.data);
    r = await rpc(key, "resources/list");
    check("an unknown method is a JSON-RPC error", r.data.error?.code === -32601, r.data);
    r = await mcp(key, [{ jsonrpc: "2.0", id: 91, method: "ping" }, { jsonrpc: "2.0", id: 92, method: "tools/list" }]);
    check("batches get one answer each", Array.isArray(r.data) && r.data.length === 2 && r.data[1].result.tools.length > 0, r.data);
    r = await fetch(`${API}/api/mcp`, { headers: { authorization: `Bearer ${key}` } });
    check("GET (no event stream) is 405", r.status === 405, r.status);

    // ── Revoked key ──
    const keyId = (await owner("GET", "/api/developer/keys")).data.keys.find((k) => k.name === "Claude").id;
    await owner("DELETE", `/api/developer/keys/${keyId}`);
    r = await rpc(key, "tools/list");
    check("a revoked key is refused", r.status === 401, r);
  } catch (err) {
    check("no unexpected error", false, err.stack || String(err));
  } finally {
    if (storeId) await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email } }).catch(() => {});
    await prisma.emailLog.deleteMany({ where: { to: email } }).catch(() => {});
    console.log("      (test store and user deleted)");
    await prisma.$disconnect();
    api.child.kill();
    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
