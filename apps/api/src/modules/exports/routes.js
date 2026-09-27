const { z } = require("zod");
const { HttpError, slugify } = require("@shopcycle/utils");
const entitlements = require("../billing/entitlements");
const { toCsv, parseCsvObjects } = require("../../lib/csv");
const { setStock } = require("../../lib/inventory");
const { amountSpent } = require("../customers/spend");
const productsRepository = require("../products/repository");
const { uniqueSlug } = require("../products/service");

/**
 * CSV export (Premium — Plan.hasCsvExport) of products, orders and
 * customers, and product import (every plan — moving a catalogue in
 * shouldn't be a paid feature). The product columns are the same both
 * ways, so export → edit in a spreadsheet → import round-trips.
 */

const PRODUCT_COLUMNS = [
  "Handle",
  "Title",
  "Description",
  "Status",
  "Vendor",
  "Product Type",
  "Tags",
  "HSN Code",
  "Variant Title",
  "SKU",
  "Price",
  "Compare At Price",
  "Inventory",
  "Image URL",
];

const ORDER_COLUMNS = [
  "Order",
  "Date",
  "Customer",
  "Email",
  "Phone",
  "Payment Status",
  "Fulfillment Status",
  "Payment Method",
  "Subtotal",
  "Discount",
  "Discount Code",
  "Shipping",
  "Tax",
  "Total",
  "Refunded",
  "Items",
  "Shipping Name",
  "Address",
  "City",
  "State",
  "PIN Code",
  "Country",
  "Invoice Number",
];

const CUSTOMER_COLUMNS = [
  "Name",
  "Email",
  "Phone",
  "Orders",
  "Amount Spent",
  "Email Marketing",
  "SMS Marketing",
  "Address 1",
  "Address 2",
  "City",
  "State",
  "PIN Code",
  "Country",
  "Customer Since",
];

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000;

async function assertCanExport(request) {
  entitlements.assertFeature(await request.getEntitlements(), "reports_advanced", "CSV export");
}

const dateOnly = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

async function exportProducts(prisma, storeId) {
  const products = await prisma.product.findMany({
    where: { storeId },
    include: { variants: { orderBy: { createdAt: "asc" } }, images: { orderBy: { position: "asc" }, take: 1 } },
    orderBy: { createdAt: "asc" },
  });
  const rows = [];
  for (const p of products) {
    for (const v of p.variants) {
      rows.push({
        Handle: p.slug,
        Title: p.title,
        Description: p.description || "",
        Status: p.status,
        Vendor: p.vendor || "",
        "Product Type": p.productType || "",
        Tags: p.tags || "",
        "HSN Code": p.hsnCode || "",
        "Variant Title": v.title,
        SKU: v.sku || "",
        Price: Number(v.price).toFixed(2),
        "Compare At Price": v.comparePrice ? Number(v.comparePrice).toFixed(2) : "",
        Inventory: v.inventoryQuantity,
        "Image URL": p.images[0]?.url || "",
      });
    }
  }
  return toCsv(PRODUCT_COLUMNS, rows);
}

async function exportOrders(prisma, storeId) {
  const orders = await prisma.order.findMany({
    where: { storeId },
    include: { items: true, customer: { select: { name: true } } },
    orderBy: { orderNumber: "asc" },
  });
  return toCsv(
    ORDER_COLUMNS,
    orders.map((o) => ({
      Order: `#${o.orderNumber}`,
      Date: o.createdAt.toISOString(),
      Customer: o.customer?.name || o.shippingName || "",
      Email: o.email || "",
      Phone: o.phone || "",
      "Payment Status": o.paymentStatus,
      "Fulfillment Status": o.fulfillmentStatus,
      "Payment Method": o.paymentMethod,
      Subtotal: Number(o.subtotal).toFixed(2),
      Discount: Number(o.discount).toFixed(2),
      "Discount Code": o.discountCode || "",
      Shipping: Number(o.shipping).toFixed(2),
      Tax: Number(o.tax).toFixed(2),
      Total: Number(o.total).toFixed(2),
      Refunded: Number(o.refundedAmount).toFixed(2),
      Items: o.items.map((i) => `${i.title} × ${i.quantity}`).join("; "),
      "Shipping Name": o.shippingName || "",
      Address: [o.shippingAddress1, o.shippingAddress2].filter(Boolean).join(", "),
      City: o.shippingCity || "",
      State: o.shippingProvince || "",
      "PIN Code": o.shippingZip || "",
      Country: o.shippingCountry || "",
      "Invoice Number": o.invoiceNumber || "",
    }))
  );
}

async function exportCustomers(prisma, storeId) {
  const customers = await prisma.customer.findMany({
    where: { storeId },
    include: { orders: { select: { total: true, refundedAmount: true, paymentStatus: true, fulfillmentStatus: true } } },
    orderBy: { createdAt: "asc" },
  });
  return toCsv(
    CUSTOMER_COLUMNS,
    customers.map((c) => ({
      Name: c.name,
      Email: c.email,
      Phone: c.phone || "",
      Orders: c.orders.length,
      "Amount Spent": amountSpent(c.orders).toFixed(2),
      "Email Marketing": c.acceptsEmailMarketing ? "yes" : "no",
      "SMS Marketing": c.acceptsSmsMarketing ? "yes" : "no",
      "Address 1": c.address1 || "",
      "Address 2": c.address2 || "",
      City: c.city || "",
      State: c.province || "",
      "PIN Code": c.zip || "",
      Country: c.country || "",
      "Customer Since": dateOnly(c.createdAt),
    }))
  );
}

// ── Product import ────────────────────────────────────────────────

const money = (label) =>
  z
    .string()
    .transform((s) => s.replace(/[₹,\s]/g, ""))
    .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, `${label} must be a number like 499 or 499.00`))
    .transform(Number);

function readGroup(lines) {
  // Product-level fields come from the first row of the group that has them.
  const pick = (col) => lines.map((l) => l.values[col]).find((v) => v) || "";
  const errors = [];
  const title = pick("Title");
  if (!title) errors.push({ line: lines[0].line, message: "Title is required." });
  const status = (pick("Status") || "draft").toLowerCase();
  if (!["active", "draft", "archived"].includes(status)) {
    errors.push({ line: lines[0].line, message: `Status must be active, draft or archived (got "${pick("Status")}").` });
  }
  const hsn = pick("HSN Code");
  if (hsn && !/^\d{4,8}$/.test(hsn)) errors.push({ line: lines[0].line, message: "HSN Code must be 4 to 8 digits." });
  const image = pick("Image URL");
  if (image && !/^https?:\/\/\S+$/i.test(image)) errors.push({ line: lines[0].line, message: "Image URL must start with http:// or https://" });

  const variants = [];
  for (const l of lines) {
    const v = l.values;
    const price = money("Price").safeParse(v.Price || "");
    if (!price.success) {
      errors.push({ line: l.line, message: price.error.issues[0].message });
      continue;
    }
    let comparePrice = null;
    if (v["Compare At Price"]) {
      const cp = money("Compare At Price").safeParse(v["Compare At Price"]);
      if (!cp.success) {
        errors.push({ line: l.line, message: cp.error.issues[0].message });
        continue;
      }
      comparePrice = cp.data;
    }
    let inventory;
    if (v.Inventory !== undefined && v.Inventory !== "") {
      if (!/^-?\d+$/.test(v.Inventory)) {
        errors.push({ line: l.line, message: "Inventory must be a whole number." });
        continue;
      }
      inventory = Number(v.Inventory);
    }
    variants.push({ title: v["Variant Title"] || "Default", sku: v.SKU || null, price: price.data, comparePrice, inventory });
  }

  return {
    errors,
    product: {
      title,
      description: pick("Description") || null,
      status,
      vendor: pick("Vendor") || null,
      productType: pick("Product Type") || null,
      tags: pick("Tags") || null,
      hsnCode: hsn || null,
    },
    image: image || null,
    variants,
  };
}

async function importProducts(prisma, store, csv, { dryRun, actorName }) {
  if (Buffer.byteLength(csv, "utf8") > MAX_IMPORT_BYTES) throw new HttpError(413, "That file is over 2 MB. Split it into smaller files.");
  const { headers, records } = parseCsvObjects(csv);
  if (!headers.includes("Title") && !headers.includes("Handle")) {
    throw new HttpError(400, `The first row must be the column names. Download the template to see them: ${PRODUCT_COLUMNS.join(", ")}.`);
  }
  if (!headers.includes("Price")) throw new HttpError(400, "A Price column is required.");
  if (records.length > MAX_IMPORT_ROWS) throw new HttpError(413, `Up to ${MAX_IMPORT_ROWS} rows per file.`);

  const groups = new Map();
  for (const r of records) {
    const handle = slugify(r.values.Handle || r.values.Title || "");
    if (!handle) continue;
    if (!groups.has(handle)) groups.set(handle, []);
    groups.get(handle).push(r);
  }

  const existing = await prisma.product.findMany({
    where: { storeId: store.id, slug: { in: [...groups.keys()] } },
    include: { variants: true, images: true },
  });
  const bySlug = Object.fromEntries(existing.map((p) => [p.slug, p]));

  const result = { created: 0, updated: 0, skipped: 0, errors: [] };
  for (const [handle, lines] of groups) {
    const parsed = readGroup(lines);
    if (parsed.errors.length || !parsed.variants.length) {
      result.errors.push(...parsed.errors);
      result.skipped += 1;
      continue;
    }
    const current = bySlug[handle];
    if (dryRun) {
      if (current) result.updated += 1;
      else result.created += 1;
      continue;
    }

    if (!current) {
      const slug = await uniqueSlug(prisma, store.id, handle);
      await productsRepository.create(
        prisma,
        store.id,
        {
          ...parsed.product,
          variants: parsed.variants.map((v) => ({
            title: v.title,
            sku: v.sku,
            price: v.price,
            comparePrice: v.comparePrice,
            inventoryQuantity: v.inventory ?? 0,
          })),
          images: parsed.image ? [{ url: parsed.image, position: 0 }] : [],
          collectionIds: [],
        },
        slug,
        { actorName }
      );
      result.created += 1;
      continue;
    }

    // Update: product fields, then each variant matched by SKU (else by
    // title). Variants missing from the file are left alone.
    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: current.id }, data: parsed.product });
      if (parsed.image && !current.images.some((i) => i.url === parsed.image)) {
        await tx.productImage.create({ data: { productId: current.id, url: parsed.image, position: current.images.length } });
      }
      for (const v of parsed.variants) {
        const match =
          (v.sku && current.variants.find((cv) => cv.sku && cv.sku === v.sku)) ||
          current.variants.find((cv) => cv.title.toLowerCase() === v.title.toLowerCase());
        if (match) {
          await tx.productVariant.update({
            where: { id: match.id },
            data: { title: v.title, sku: v.sku, price: v.price, comparePrice: v.comparePrice },
          });
          if (v.inventory !== undefined && v.inventory !== match.inventoryQuantity) {
            await setStock(tx, { storeId: store.id, variantId: match.id, quantity: v.inventory, reason: "import", note: "CSV import", actorName });
          }
        } else {
          const created = await tx.productVariant.create({
            data: { productId: current.id, title: v.title, sku: v.sku, price: v.price, comparePrice: v.comparePrice, inventoryQuantity: 0 },
          });
          if (v.inventory) {
            await setStock(tx, { storeId: store.id, variantId: created.id, quantity: v.inventory, reason: "import", note: "CSV import", actorName });
          }
        }
      }
    });
    result.updated += 1;
  }
  return result;
}

const importSchema = z.object({
  csv: z.string().min(1, "The file is empty."),
  dryRun: z.boolean().default(false),
});

async function exportRoutes(fastify) {
  fastify.addHook("preHandler", fastify.authenticate);
  fastify.addHook("preHandler", fastify.loadStoreContext);
  fastify.addHook("preHandler", fastify.requireActiveSubscription);

  fastify.get("/exports/:kind", async (request, reply) => {
    await assertCanExport(request);
    const kind = z.enum(["products", "orders", "customers"]).parse(request.params.kind.replace(/\.csv$/, ""));
    const { prisma } = fastify;
    const csv =
      kind === "products"
        ? await exportProducts(prisma, request.store.id)
        : kind === "orders"
          ? await exportOrders(prisma, request.store.id)
          : await exportCustomers(prisma, request.store.id);
    const stamp = new Date().toISOString().slice(0, 10);
    reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${request.store.handle}-${kind}-${stamp}.csv"`)
      .send(csv);
  });

  fastify.get("/templates/products", async (request, reply) => {
    const sample = toCsv(PRODUCT_COLUMNS, [
      {
        Handle: "classic-cotton-tee",
        Title: "Classic Cotton Tee",
        Description: "Soft 180 GSM combed cotton.",
        Status: "active",
        Vendor: "Your brand",
        "Product Type": "T-shirts",
        Tags: "cotton, summer",
        "HSN Code": "6109",
        "Variant Title": "S",
        SKU: "TEE-S",
        Price: "599.00",
        "Compare At Price": "799.00",
        Inventory: 25,
        "Image URL": "",
      },
      { Handle: "classic-cotton-tee", "Variant Title": "M", SKU: "TEE-M", Price: "599.00", Inventory: 40 },
    ]);
    reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", 'attachment; filename="oyklane-product-import-template.csv"')
      .send(sample);
  });

  fastify.post("/imports/products", { bodyLimit: MAX_IMPORT_BYTES * 2 }, async (request, reply) => {
    if (request.storeRole === "staff") throw new HttpError(403, "Only the store owner or an admin can import products.");
    const { csv, dryRun } = importSchema.parse(request.body);
    reply.send(await importProducts(fastify.prisma, request.store, csv, { dryRun, actorName: request.authUser?.name }));
  });
}

module.exports = exportRoutes;
module.exports.importProducts = importProducts;
module.exports.PRODUCT_COLUMNS = PRODUCT_COLUMNS;
