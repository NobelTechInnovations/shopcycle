/**
 * Discounts, end to end: off a collection, capped percentage, buy X get Y,
 * free shipping, automatic discounts (and a code replacing one), partial
 * edits, once per customer at checkout, list tabs and numbers, duplicate.
 * Creates a throwaway store and deletes it when done, pass or fail.
 */
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
require(path.join(ROOT, "apps/api/node_modules/dotenv")).config({ path: path.join(ROOT, ".env") });
Object.assign(process.env, { SMTP_HOST: "", EMAIL_PROVIDER: "log", SMS_PROVIDER: "log", WHATSAPP_PROVIDER: "log", MEDIA_STORAGE: "database" });

const API_PORT = 4201;
const API = `http://localhost:${API_PORT}`;
const ORIGIN = process.env.ADMIN_ORIGIN || "http://localhost:3000";

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
      headers: {
        ...(body !== undefined && { "content-type": "application/json" }),
        ...(method !== "GET" && { origin: ORIGIN }),
        cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(";");
      const [k, ...v] = pair.split("=");
      jar[k.trim()] = v.join("=");
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data };
  };
}
const sf = client();

async function startApi() {
  const child = spawn(process.execPath, [path.join(ROOT, "apps/api/src/server.js")], {
    cwd: path.join(ROOT, "apps/api"),
    env: { ...process.env, API_PORT: String(API_PORT), NODE_ENV: "test", JOBS_DISABLED: "true" },
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

async function main() {
  const { prisma } = require(path.join(ROOT, "packages/database/src/client.js"));
  const api = await startApi();
  const stamp = Date.now();
  const email = `disc-e2e-${stamp}@test.oyklane.dev`;
  const owner = client();
  let storeId = null;
  try {
    let r = await owner("POST", "/api/auth/register", { name: "Disc Test", email, password: "correct-horse-battery", storeName: `Disc E2E ${stamp}`, plan: "growth" });
    check("register a store", r.status === 201, r.data);
    const store = r.data.store;
    storeId = store.id;
    const mk = async (title, price) => (await owner("POST", "/api/products", { title, status: "active", variants: [{ title: "Default", sku: `${title}-${stamp}`, price, inventoryQuantity: 50 }] })).data.product;
    const sweet = await mk("Ladoo", 300);
    const snack = await mk("Namkeen", 100);
    r = await owner("POST", "/api/collections", { title: "Sweets", status: "active", productIds: [sweet.id] });
    const col = r.data.collection;
    if (col && !(await prisma.collectionProduct.findFirst({ where: { collectionId: col.id, productId: sweet.id } }))) {
      await prisma.collectionProduct.create({ data: { collectionId: col.id, productId: sweet.id } }).catch(() => {});
    }
    check("collection made", Boolean(col), r.data);

    const cart = async (lines) => {
      let id;
      for (const [p, q] of lines) id = (await sf("POST", `/api/storefront/${store.handle}/cart/add`, { ...(id && { cartId: id }), variantId: p.variants[0].id, quantity: q })).data.cart.cartId;
      return id;
    };
    const getCart = async (id) => (await sf("GET", `/api/storefront/${store.handle}/cart?cartId=${id}`)).data.cart;
    const apply = async (id, code) => (await sf("POST", `/api/storefront/${store.handle}/cart/discount`, { cartId: id, code })).data;

    r = await owner("POST", "/api/discounts", { code: "SWEET20", type: "percentage", value: 20, appliesTo: "collections", targetIds: [col.id] });
    check("create collection discount", r.status === 201, r.data);
    let id = await cart([[sweet, 2], [snack, 2]]);
    let c = await apply(id, "sweet20");
    check("20% off only the sweets (600 → 120)", c.cart?.discount?.amount === 120, c.cart?.discount || c);

    r = await owner("POST", "/api/discounts", { code: "CAP", type: "percentage", value: 50, maxDiscount: 100 });
    c = await apply(id, "cap");
    check("percentage capped at ₹100", c.cart?.discount?.amount === 100, c.cart?.discount || c);

    r = await owner("POST", "/api/discounts", { code: "B2G1", type: "buy_x_get_y", value: 100, buyQuantity: 2, getQuantity: 1 });
    check("create buy 2 get 1", r.status === 201, r.data);
    id = await cart([[sweet, 2], [snack, 1]]);
    c = await apply(id, "B2G1");
    check("buy 2 get 1: cheapest (₹100) free", c.cart?.discount?.amount === 100, c.cart?.discount || c);
    id = await cart([[sweet, 1]]);
    r = await sf("POST", `/api/storefront/${store.handle}/cart/discount`, { cartId: id, code: "B2G1" });
    check("buy 2 get 1 refused with 1 item", r.status === 400, r.data);

    r = await owner("POST", "/api/discounts", { code: "FREESHIP", type: "free_shipping", minSubtotal: 500 });
    check("create free shipping", r.status === 201, r.data);

    r = await owner("POST", "/api/discounts", { method: "automatic", title: "Festive 10% off", type: "percentage", value: 10, minQuantity: 3 });
    check("create automatic discount", r.status === 201 && /^AUTO-/.test(r.data.discount.code), r.data);
    const autoId = r.data.discount.id;
    id = await cart([[snack, 3]]);
    c = await getCart(id);
    check("automatic applies by itself (10% of 300)", c.discount?.automatic === true && c.discount.amount === 30 && c.discount.code === "Festive 10% off", c.discount);
    c = await apply(id, "CAP");
    check("a code replaces the automatic one", c.cart?.discount?.code === "CAP" && c.cart.discount.amount === 100, c.cart?.discount);

    r = await owner("PATCH", `/api/discounts/${autoId}`, { status: "disabled" });
    check("partial edit keeps the rest", r.status === 200 && r.data.discount.minQuantity === 3 && r.data.discount.title === "Festive 10% off" && r.data.discount.method === "automatic", r.data.discount);
    r = await owner("PATCH", `/api/discounts/${autoId}`, { value: 150 });
    check("edit checked against the saved type (150% refused)", r.status === 400, r.data);

    r = await owner("POST", "/api/discounts", { code: "ONCE", type: "fixed_amount", value: 50, oncePerCustomer: true });
    const shopper = { email: "disc.buyer@test.oyklane.dev", phone: "9876543210", shippingName: "Disc Buyer", shippingAddress1: "1 Road", shippingCity: "Jaipur", shippingProvince: "RJ", shippingZip: "302001", shippingCountry: "IN" };
    id = await cart([[snack, 1]]);
    await apply(id, "ONCE");
    r = await sf("POST", `/api/storefront/${store.handle}/checkout`, { cartId: id, ...shopper, paymentMethod: "cod" });
    if (r.status !== 201) {
      await prisma.store.update({ where: { id: storeId }, data: { settings: { codEnabled: true } } });
      id = await cart([[snack, 1]]);
      await apply(id, "ONCE");
      r = await sf("POST", `/api/storefront/${store.handle}/checkout`, { cartId: id, ...shopper, paymentMethod: "cod" });
    }
    check("order with a once-per-customer code", r.status === 201 && Number(r.data.order.discount) === 50, r.data);
    id = await cart([[snack, 1]]);
    await apply(id, "ONCE");
    r = await sf("POST", `/api/storefront/${store.handle}/checkout`, { cartId: id, ...shopper, paymentMethod: "cod" });
    check("same customer can't use it twice", r.status === 400 && /one per customer/.test(r.data.error || ""), r.data);
    const once = await prisma.discount.findFirst({ where: { storeId, code: "ONCE" } });
    check("usage counted", once.usageCount === 1, once.usageCount);

    r = await owner("GET", "/api/discounts?status=disabled");
    check("tabs: 1 turned off", r.data.total === 1 && r.data.counts.all === 6 && r.data.summary.orders30 === 1, { total: r.data.total, counts: r.data.counts, summary: r.data.summary });
    r = await owner("POST", `/api/discounts/${once.id}/duplicate`);
    check("duplicate is off, new code", r.status === 201 && r.data.discount.status === "disabled" && r.data.discount.code === "ONCE-COPY", r.data.discount);
  } catch (err) {
    fail += 1;
    console.log(`FAIL  unexpected error: ${err.stack || err}`);
    console.log(api.log().slice(-3000));
  } finally {
    if (storeId) await prisma.store.delete({ where: { id: storeId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email } }).catch(() => {});
    await prisma.emailLog.deleteMany({ where: { to: { endsWith: "@test.oyklane.dev" } } }).catch(() => {});
    console.log("      (test store, user and emails deleted)");
    await prisma.$disconnect();
    api.child.kill();
  }
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
