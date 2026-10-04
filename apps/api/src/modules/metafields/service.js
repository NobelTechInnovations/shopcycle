const { HttpError } = require("@shopcycle/utils");

/**
 * Custom data ("metafields"): a seller defines extra fields once —
 * "Fabric", "Fit", "Care instructions", "Size chart" — and every product
 * (or collection) gets an input for them. Values are stored on the
 * owner's `metafields` JSON as { key: value }, checked against the
 * definitions here, and exposed to themes as
 * `product.metafields.custom.<key>` plus a ready-made `product.specs` list.
 */

const TYPES = [
  { key: "text", label: "Short text", hint: "A word or a line — e.g. Fabric: Cotton" },
  { key: "multiline", label: "Paragraph", hint: "Several lines — e.g. care instructions" },
  { key: "number", label: "Number", hint: "e.g. Weight in grams" },
  { key: "boolean", label: "Yes / No", hint: "e.g. Handmade" },
  { key: "date", label: "Date", hint: "e.g. Launch date" },
  { key: "url", label: "Link", hint: "e.g. Lookbook video" },
  { key: "color", label: "Colour", hint: "e.g. Swatch colour" },
  { key: "image", label: "Image", hint: "e.g. Size chart" },
  { key: "list", label: "List", hint: "Several short values — e.g. Occasions" },
];
const TYPE_KEYS = TYPES.map((t) => t.key);
const OWNERS = ["product", "collection"];
const MAX_DEFINITIONS = 50;

const keyFrom = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

function assertOwner(ownerType) {
  if (!OWNERS.includes(ownerType)) throw new HttpError(400, "Custom data is for products or collections.");
}

function list(prisma, storeId, ownerType) {
  assertOwner(ownerType);
  return prisma.metafieldDefinition.findMany({ where: { storeId, ownerType }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
}

function cleanChoices(type, choices) {
  if (type !== "text" || !Array.isArray(choices)) return [];
  return [...new Set(choices.map((c) => String(c).trim().slice(0, 80)).filter(Boolean))].slice(0, 50);
}

async function create(prisma, storeId, input) {
  assertOwner(input.ownerType);
  const name = String(input.name || "").trim().slice(0, 60);
  if (!name) throw new HttpError(400, "Give the field a name.");
  if (!TYPE_KEYS.includes(input.type)) throw new HttpError(400, "Choose a field type.");
  const key = keyFrom(input.key || name);
  if (!key || !/^[a-z]/.test(key)) throw new HttpError(400, "The key must start with a letter.");
  const count = await prisma.metafieldDefinition.count({ where: { storeId, ownerType: input.ownerType } });
  if (count >= MAX_DEFINITIONS) throw new HttpError(400, `Up to ${MAX_DEFINITIONS} fields each for products and collections.`);
  if (await prisma.metafieldDefinition.findFirst({ where: { storeId, ownerType: input.ownerType, key } })) {
    throw new HttpError(409, `There's already a field with the key "${key}".`);
  }
  return prisma.metafieldDefinition.create({
    data: {
      storeId,
      ownerType: input.ownerType,
      key,
      name,
      description: input.description ? String(input.description).slice(0, 300) : null,
      type: input.type,
      choices: cleanChoices(input.type, input.choices),
      showOnStorefront: input.showOnStorefront !== false,
      position: count,
    },
  });
}

/** Name, description, choices and visibility can change; the key and type
 * can't (values already saved depend on them). */
async function update(prisma, storeId, id, input) {
  const def = await prisma.metafieldDefinition.findFirst({ where: { id, storeId } });
  if (!def) throw new HttpError(404, "Field not found");
  const data = {};
  if (input.name !== undefined) {
    data.name = String(input.name).trim().slice(0, 60);
    if (!data.name) throw new HttpError(400, "Give the field a name.");
  }
  if (input.description !== undefined) data.description = input.description ? String(input.description).slice(0, 300) : null;
  if (input.choices !== undefined) data.choices = cleanChoices(def.type, input.choices);
  if (input.showOnStorefront !== undefined) data.showOnStorefront = Boolean(input.showOnStorefront);
  return prisma.metafieldDefinition.update({ where: { id }, data });
}

async function reorder(prisma, storeId, ownerType, ids) {
  assertOwner(ownerType);
  const defs = await list(prisma, storeId, ownerType);
  const known = new Set(defs.map((d) => d.id));
  const order = ids.filter((id) => known.has(id));
  await prisma.$transaction(order.map((id, position) => prisma.metafieldDefinition.update({ where: { id }, data: { position } })));
  return list(prisma, storeId, ownerType);
}

/** Deleting a field also deletes its saved values. */
async function remove(prisma, storeId, id) {
  const def = await prisma.metafieldDefinition.findFirst({ where: { id, storeId } });
  if (!def) throw new HttpError(404, "Field not found");
  await prisma.metafieldDefinition.delete({ where: { id } });
  if (def.ownerType === "product") {
    await prisma.$executeRaw`UPDATE "products" SET "metafields" = "metafields" - ${def.key} WHERE "storeId" = ${storeId} AND "metafields" ? ${def.key}`;
  } else {
    await prisma.$executeRaw`UPDATE "collections" SET "metafields" = "metafields" - ${def.key} WHERE "storeId" = ${storeId} AND "metafields" ? ${def.key}`;
  }
}

const EMPTY = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** One value, checked and normalised for its field's type. */
function coerce(def, raw) {
  const bad = (why) => {
    throw new HttpError(400, `${def.name}: ${why}`);
  };
  switch (def.type) {
    case "text": {
      const v = String(raw).trim().slice(0, 255);
      if (def.choices?.length && !def.choices.includes(v)) bad(`choose one of ${def.choices.join(", ")}.`);
      return v;
    }
    case "multiline":
      return String(raw).slice(0, 5000);
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) bad("enter a number.");
      return n;
    }
    case "boolean":
      return raw === true || raw === "true" || raw === 1 || raw === "1";
    case "date": {
      const v = String(raw).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) bad("enter a date.");
      return v;
    }
    case "url":
    case "image": {
      const v = String(raw).trim();
      if (!/^https?:\/\/\S+$/i.test(v) && !(def.type === "image" && v.startsWith("/"))) bad("enter a full link starting with https://");
      return v.slice(0, 1000);
    }
    case "color": {
      const v = String(raw).trim();
      if (!/^#[0-9a-f]{6}$/i.test(v)) bad("pick a colour.");
      return v.toLowerCase();
    }
    case "list": {
      const items = (Array.isArray(raw) ? raw : String(raw).split(","))
        .map((s) => String(s).trim().slice(0, 80))
        .filter(Boolean);
      return [...new Set(items)].slice(0, 30);
    }
    default:
      return undefined;
  }
}

/**
 * The owner's metafields after applying `changes` over `current`: only
 * defined keys are kept, each value is checked, and a blank value clears
 * that field. Keys not mentioned in `changes` keep their current value
 * (the public API can send just one field).
 */
async function applyValues(prisma, storeId, ownerType, changes, current = {}) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return undefined;
  const defs = await list(prisma, storeId, ownerType);
  const byKey = Object.fromEntries(defs.map((d) => [d.key, d]));
  const out = {};
  for (const [k, v] of Object.entries(current || {})) if (byKey[k]) out[k] = v;
  for (const [k, raw] of Object.entries(changes)) {
    const def = byKey[k];
    if (!def) continue; // unknown keys are ignored, not an error
    if (EMPTY(raw)) {
      delete out[k];
      continue;
    }
    const v = coerce(def, raw);
    if (EMPTY(v)) delete out[k];
    else out[k] = v;
  }
  return out;
}

function display(def, v, currencyFormat) {
  if (EMPTY(v)) return null;
  switch (def.type) {
    case "boolean":
      return v ? "Yes" : "No";
    case "list":
      return v.join(", ");
    case "date":
      return new Date(`${v}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    case "number":
      return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
    default:
      return String(v);
  }
}

/** The "Details" rows for the storefront — only fields the seller marked
 * visible, in their order, with a display value. */
function specs(defs, values) {
  return defs
    .filter((d) => d.showOnStorefront && !EMPTY(values?.[d.key]))
    .map((d) => ({ key: d.key, name: d.name, type: d.type, value: values[d.key], display: display(d, values[d.key]) }));
}

module.exports = { TYPES, TYPE_KEYS, OWNERS, list, create, update, reorder, remove, applyValues, specs, keyFrom };
