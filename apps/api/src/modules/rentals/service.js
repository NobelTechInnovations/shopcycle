const { HttpError } = require("@shopcycle/utils");
const D = require("./dates");

/**
 * Rentals app. A product can be rented by the day instead of sold: the
 * seller sets a daily rate (lower for longer rentals), a refundable
 * deposit and how many pieces of each size they own. Shoppers pick dates
 * on the product page — booked days are greyed out — and the rental goes
 * through the cart and checkout like any order (or, in "request" mode,
 * as a booking request the seller confirms). Each rented piece becomes a
 * RentalBooking the seller tracks: out for delivery, returned, late, the
 * deposit given back.
 *
 * Stock is never touched: a rental piece comes back.
 */

const APP_KEY = "rentals";
// Bookings that hold a piece. A request doesn't until the seller confirms it.
const HOLDING = ["confirmed", "out", "blocked"];
const STATUSES = ["requested", "confirmed", "out", "returned", "cancelled", "blocked"];

const DEFAULTS = {
  checkoutMode: "cart", // cart: book and pay at checkout · request: the seller confirms first
  handover: "both", // delivery | store_pickup | both
  returns: "both", // collect | drop_off | both
  pickupAddress: "",
  depositCollection: "on_delivery", // checkout | on_delivery
  lateFeePerDay: 0,
  bookingWindowDays: 180,
  terms: "",
};

const HANDOVER_LABEL = { delivery: "Delivered to you", store_pickup: "Pick up from the store" };
const RETURN_LABEL = { collect: "We collect it from you", drop_off: "Drop it back at the store" };

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const int = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** The app's settings (Apps ▸ Rentals ▸ Settings), with defaults. */
function settingsFor(raw) {
  const s = { ...DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
  return {
    checkoutMode: s.checkoutMode === "request" ? "request" : "cart",
    handover: ["delivery", "store_pickup", "both"].includes(s.handover) ? s.handover : "both",
    returns: ["collect", "drop_off", "both"].includes(s.returns) ? s.returns : "both",
    pickupAddress: String(s.pickupAddress || "").slice(0, 400),
    depositCollection: s.depositCollection === "checkout" ? "checkout" : "on_delivery",
    lateFeePerDay: Math.max(0, money(s.lateFeePerDay)),
    bookingWindowDays: int(s.bookingWindowDays, 14, 730, 180),
    terms: String(s.terms || "").slice(0, 2000),
  };
}

const handoverOptions = (s) => (s.handover === "both" ? ["delivery", "store_pickup"] : [s.handover]);
const returnOptions = (s) => (s.returns === "both" ? ["collect", "drop_off"] : [s.returns]);

/** A product's rental rules as plain numbers, tiers sorted by days. */
function configOf(row) {
  if (!row) return null;
  const tiers = (Array.isArray(row.tiers) ? row.tiers : [])
    .map((t) => ({ days: int(t.days, 2, 365, 0), price: money(t.price) }))
    .filter((t) => t.days >= 2 && t.price > 0)
    .sort((a, b) => a.days - b.days);
  return {
    enabled: row.enabled !== false,
    pricePerDay: money(row.pricePerDay),
    tiers,
    minDays: int(row.minDays, 1, 365, 1),
    maxDays: int(row.maxDays, 1, 365, 30),
    deposit: money(row.deposit),
    units: int(row.units, 1, 999, 1),
    bufferDays: int(row.bufferDays, 0, 30, 1),
    leadDays: int(row.leadDays, 0, 60, 1),
  };
}

/** The daily rate for a rental of `days`: the longest tier it reaches. */
function rateFor(cfg, days) {
  let rate = cfg.pricePerDay;
  for (const t of cfg.tiers) if (days >= t.days) rate = t.price;
  return rate;
}

/** What `quantity` pieces cost for start → end. `unitPrice` is what the
 * cart charges per piece: the rent, plus the deposit when it's paid at
 * checkout. */
function quote(cfg, settings, { start, end, quantity = 1 }) {
  const days = D.span(start, end);
  const pricePerDay = rateFor(cfg, days);
  const rentalTotal = money(pricePerDay * days);
  const deposit = cfg.deposit;
  const depositAtCheckout = settings.depositCollection === "checkout" && deposit > 0;
  const unitPrice = money(rentalTotal + (depositAtCheckout ? deposit : 0));
  return { days, pricePerDay, rentalTotal, deposit, depositAtCheckout, unitPrice, lineTotal: money(unitPrice * quantity) };
}

/** Checks the dates against the product's rules; throws what to fix. */
function checkRange(cfg, settings, start, end, { now = new Date(), seller = false } = {}) {
  if (!D.isDay(start) || !D.isDay(end)) throw new HttpError(400, "Pick the first and last day of the rental.");
  if (end < start) throw new HttpError(400, "The last day can't be before the first day.");
  const days = D.span(start, end);
  if (!seller) {
    const earliest = D.addDays(D.today(now), cfg.leadDays);
    if (start < earliest) throw new HttpError(400, `The earliest first day is ${D.label(earliest)}.`);
    const latest = D.addDays(D.today(now), settings.bookingWindowDays);
    if (start > latest) throw new HttpError(400, `Bookings open up to ${D.label(latest)}.`);
    if (days < cfg.minDays) throw new HttpError(400, `Rent it for at least ${cfg.minDays} day${cfg.minDays === 1 ? "" : "s"}.`);
    if (days > cfg.maxDays) throw new HttpError(400, `Rent it for at most ${cfg.maxDays} days.`);
  } else if (days > 366) {
    throw new HttpError(400, "A booking can't be longer than a year.");
  }
  return days;
}

// ── Availability ─────────────────────────────────────────────────

/** The bookings that could overlap days from `from` on. */
function holdingBookings(db, storeId, productId, from) {
  return db.rentalBooking.findMany({
    where: {
      storeId,
      productId,
      status: { in: HOLDING },
      OR: [{ endDate: { gte: D.toDate(D.addDays(from, -45)) } }, { status: "out" }],
    },
    select: { id: true, variantId: true, startDate: true, endDate: true, quantity: true, status: true },
  });
}

/** Pieces taken per variant per day: each booking holds its days plus the
 * buffer after it; a piece that's late coming back holds until today. A
 * block without a variant holds every size. */
function occupancy(bookings, bufferDays, now = new Date(), { exclude } = {}) {
  const today = D.today(now);
  const occ = new Map();
  for (const b of bookings) {
    if (exclude && b.id === exclude) continue;
    const start = D.fromDate(b.startDate);
    let end = D.fromDate(b.endDate);
    if (b.status === "out" && end < today) end = today;
    const key = b.variantId || "*";
    if (!occ.has(key)) occ.set(key, new Map());
    const days = occ.get(key);
    for (const day of D.eachDay(start, D.addDays(end, bufferDays))) days.set(day, (days.get(day) || 0) + (b.quantity || 1));
  }
  return occ;
}

function taken(occ, variantId, day) {
  return (occ.get(variantId)?.get(day) || 0) + (occ.get("*")?.get(day) || 0);
}

/** Can `quantity` more pieces go out start → end (and its buffer)? */
function fits(occ, cfg, variantId, start, end, quantity) {
  for (const day of D.eachDay(start, D.addDays(end, cfg.bufferDays))) {
    if (taken(occ, variantId, day) + quantity > cfg.units) return false;
  }
  return true;
}

/** Throws a 409 when the dates aren't free. `extra`: other unbooked lines
 * for the same product (the rest of the cart). */
async function assertFree(db, storeId, productId, cfg, { variantId, start, end, quantity = 1, exclude, extra = [], now } = {}) {
  const bookings = await holdingBookings(db, storeId, productId, start);
  const pending = extra.map((x, i) => ({ id: `cart-${i}`, variantId: x.variantId, startDate: D.toDate(x.start), endDate: D.toDate(x.end), quantity: x.quantity, status: "confirmed" }));
  const occ = occupancy([...bookings, ...pending], cfg.bufferDays, now, { exclude });
  if (!fits(occ, cfg, variantId, start, end, quantity)) {
    throw new HttpError(409, cfg.units > 1 || quantity > 1 ? "Not enough pieces are free for those dates. Try other dates." : "Those dates are already booked. Pick other dates.");
  }
}

/** Days a shopper can't pick, per variant, from today to the end of the
 * booking window: every piece is out (or being readied) that day. */
async function bookedDays(db, storeId, product, cfg, settings, now = new Date()) {
  const from = D.today(now);
  const to = D.addDays(from, settings.bookingWindowDays + cfg.maxDays);
  const occ = occupancy(await holdingBookings(db, storeId, product.id, from), cfg.bufferDays, now);
  const out = {};
  for (const v of product.variants || []) {
    const full = [];
    const keys = new Set([...(occ.get(v.id)?.keys() || []), ...(occ.get("*")?.keys() || [])]);
    for (const day of [...keys].sort()) if (day >= from && day <= to && taken(occ, v.id, day) >= cfg.units) full.push(day);
    out[v.id] = full;
  }
  return out;
}

// ── Product setup ────────────────────────────────────────────────

async function installedSettings(db, storeId) {
  const install = await db.storeApp.findFirst({ where: { storeId, app: { key: APP_KEY } }, select: { settings: true } });
  return install ? settingsFor(install.settings) : null;
}

async function getProductConfig(prisma, storeId, productId) {
  const product = await prisma.product.findFirst({ where: { id: productId, storeId }, select: { id: true, title: true, rental: true } });
  if (!product) throw new HttpError(404, "Product not found");
  return product.rental ? configOf(product.rental) : null;
}

/** Saves (or turns off) a product's rental rules. */
async function saveProductConfig(prisma, storeId, productId, input) {
  const product = await prisma.product.findFirst({ where: { id: productId, storeId }, select: { id: true } });
  if (!product) throw new HttpError(404, "Product not found");
  const cfg = configOf({ ...input, enabled: input.enabled !== false });
  if (cfg.enabled && !(cfg.pricePerDay > 0)) throw new HttpError(400, "Set the rent per day.");
  if (cfg.maxDays < cfg.minDays) throw new HttpError(400, "The longest rental can't be shorter than the shortest.");
  for (const t of cfg.tiers) {
    if (t.price >= cfg.pricePerDay) throw new HttpError(400, `The ${t.days}+ day rate should be lower than the normal daily rent.`);
  }
  const data = { enabled: cfg.enabled, pricePerDay: cfg.pricePerDay, tiers: cfg.tiers, minDays: cfg.minDays, maxDays: cfg.maxDays, deposit: cfg.deposit, units: cfg.units, bufferDays: cfg.bufferDays, leadDays: cfg.leadDays };
  const row = await prisma.rentalProduct.upsert({ where: { productId }, create: { storeId, productId, ...data }, update: data });
  return configOf(row);
}

async function removeProductConfig(prisma, storeId, productId) {
  await prisma.rentalProduct.deleteMany({ where: { storeId, productId } });
}

// ── Storefront ───────────────────────────────────────────────────

/** For product cards: "₹1,000 / day", "from ₹800 / day". */
function cardInfo(row) {
  const cfg = configOf(row);
  if (!cfg?.enabled) return null;
  const lowest = cfg.tiers.length ? Math.min(cfg.pricePerDay, ...cfg.tiers.map((t) => t.price)) : cfg.pricePerDay;
  return { price_per_day: cfg.pricePerDay, from_price: lowest, has_tiers: cfg.tiers.length > 0, deposit: cfg.deposit };
}

/** Everything the product page's booking block needs. */
async function productContext(prisma, store, product, row, settingsRaw, routes, now = new Date()) {
  const cfg = configOf(row);
  if (!cfg?.enabled) return null;
  const settings = settingsFor(settingsRaw);
  const booked = await bookedDays(prisma, store.id, product, cfg, settings, now);
  const today = D.today(now);
  const client = {
    currency: store.currency,
    pricePerDay: cfg.pricePerDay,
    tiers: cfg.tiers,
    minDays: cfg.minDays,
    maxDays: cfg.maxDays,
    deposit: cfg.deposit,
    depositAtCheckout: settings.depositCollection === "checkout",
    bufferDays: cfg.bufferDays,
    units: cfg.units,
    earliest: D.addDays(today, cfg.leadDays),
    latest: D.addDays(today, settings.bookingWindowDays),
    booked,
    mode: settings.checkoutMode,
  };
  return {
    ...cardInfo(row),
    tiers: cfg.tiers,
    min_days: cfg.minDays,
    max_days: cfg.maxDays,
    deposit_at_checkout: client.depositAtCheckout,
    buffer_days: cfg.bufferDays,
    earliest: client.earliest,
    latest: client.latest,
    mode: settings.checkoutMode,
    request_url: `${routes.root_url === "/" ? "" : routes.root_url}/apps/rentals/request`,
    handover_options: handoverOptions(settings).map((value) => ({ value, label: HANDOVER_LABEL[value] })),
    return_options: returnOptions(settings).map((value) => ({ value, label: RETURN_LABEL[value] })),
    pickup_address: settings.pickupAddress || null,
    late_fee: settings.lateFeePerDay || null,
    terms: settings.terms || null,
    client_json: JSON.stringify(client).replace(/</g, "\\u003c"),
  };
}

// ── Cart ─────────────────────────────────────────────────────────

/** Validates a rental the shopper is adding; returns what the cart keeps. */
async function cartRental(prisma, storeId, { variant, input, quantity, otherLines = [], settings, now }) {
  const product = variant.product;
  const cfg = configOf(product.rental);
  if (!cfg?.enabled || !settings) throw new HttpError(400, "This product can't be rented right now.");
  const start = String(input.start || "");
  const end = String(input.end || input.start || "");
  checkRange(cfg, settings, start, end, { now });
  const handover = handoverOptions(settings).includes(input.handover) ? input.handover : handoverOptions(settings)[0];
  const returnMethod = returnOptions(settings).includes(input.returnMethod) ? input.returnMethod : returnOptions(settings)[0];
  const extra = otherLines.filter((l) => l.rental && l.productId === product.id).map((l) => ({ variantId: l.variantId, start: l.rental.start, end: l.rental.end, quantity: l.quantity }));
  await assertFree(prisma, storeId, product.id, cfg, { variantId: variant.id, start, end, quantity, extra, now });
  return { start, end, handover, returnMethod };
}

/** The price and details of a rental line in the cart (or null when the
 * product stopped being rentable — the line is then dropped). */
function cartLineDetails(product, rental, settings, quantity) {
  const cfg = configOf(product.rental);
  if (!cfg?.enabled || !settings || !D.isDay(rental?.start) || !D.isDay(rental?.end)) return null;
  const q = quote(cfg, settings, { start: rental.start, end: rental.end, quantity });
  const how = [HANDOVER_LABEL[rental.handover], RETURN_LABEL[rental.returnMethod]].filter(Boolean).join(" · ");
  const deposit = q.deposit > 0 ? ` · Deposit ${q.depositAtCheckout ? "included" : "on delivery"}: ₹${q.deposit.toLocaleString("en-IN")}` : "";
  return {
    price: q.unitPrice,
    rental: { ...rental, days: q.days, pricePerDay: q.pricePerDay, rentalTotal: q.rentalTotal, deposit: q.deposit, depositAtCheckout: q.depositAtCheckout },
    detail: `Rental · ${D.rangeLabel(rental.start, rental.end)}${how ? ` · ${how}` : ""}${deposit}`,
  };
}

// ── Orders ───────────────────────────────────────────────────────

function addressOf(o) {
  return [o.shippingName, o.shippingAddress1, o.shippingAddress2, [o.shippingCity, o.shippingProvince, o.shippingZip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/** Inside checkout's transaction: books every rental line of the new
 * order, checking once more that the dates are still free. */
async function bookOrder(tx, storeId, order, items) {
  for (const item of items) {
    const rental = item.properties?.rental;
    if (!rental || !item.productId) continue;
    const row = await tx.rentalProduct.findUnique({ where: { productId: item.productId } });
    const cfg = configOf(row);
    if (!cfg) throw new HttpError(409, `${item.title} can't be rented any more. Remove it from your cart.`);
    try {
      await assertFree(tx, storeId, item.productId, cfg, { variantId: item.variantId, start: rental.start, end: rental.end, quantity: item.quantity });
    } catch (err) {
      if (err.statusCode === 409) throw new HttpError(409, `Sorry — ${item.title} was just booked for ${D.rangeLabel(rental.start, rental.end)}. Change the dates in your cart.`);
      throw err;
    }
    await tx.rentalBooking.create({
      data: {
        storeId,
        productId: item.productId,
        variantId: item.variantId,
        orderId: order.id,
        title: item.title,
        customerName: order.shippingName,
        email: order.email,
        phone: order.phone,
        startDate: D.toDate(rental.start),
        endDate: D.toDate(rental.end),
        days: rental.days,
        quantity: item.quantity,
        pricePerDay: rental.pricePerDay,
        rentalTotal: money(rental.rentalTotal * item.quantity),
        deposit: money(rental.deposit * item.quantity),
        depositStatus: rental.deposit > 0 ? (rental.depositAtCheckout ? "held" : "due") : "none",
        handover: rental.handover,
        returnMethod: rental.returnMethod,
        address: rental.handover === "delivery" || rental.returnMethod === "collect" ? addressOf(order) : null,
        status: "confirmed",
        source: "online",
      },
    });
  }
}

/** The order was cancelled: its pieces are free again. */
function releaseOrder(db, orderId) {
  return db.rentalBooking.updateMany({ where: { orderId, status: { in: ["requested", "confirmed"] } }, data: { status: "cancelled" } });
}

// ── Booking requests (request mode) ──────────────────────────────

async function requestBooking(prisma, store, input, { now } = {}) {
  const settings = await installedSettings(prisma, store.id);
  if (!settings) throw new HttpError(404, "Rentals aren't available in this store.");
  const name = String(input.name || "").trim().slice(0, 120);
  const phone = String(input.phone || "").trim().slice(0, 20);
  const email = String(input.email || "").trim().toLowerCase().slice(0, 200);
  if (!name) throw new HttpError(400, "Enter your name.");
  if (!/^\+?[\d\s-]{7,20}$/.test(phone)) throw new HttpError(400, "Enter a valid mobile number.");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Enter a valid email, or leave it empty.");
  const variant = await prisma.productVariant.findFirst({
    where: { id: String(input.variantId || ""), product: { storeId: store.id, status: "active" } },
    include: { product: { include: { rental: true } } },
  });
  if (!variant) throw new HttpError(404, "Choose a size first.");
  const cfg = configOf(variant.product.rental);
  if (!cfg?.enabled) throw new HttpError(400, "This product can't be rented right now.");
  const quantity = int(input.quantity, 1, 10, 1);
  const rental = await cartRental(prisma, store.id, { variant, input, quantity, settings, now });
  const q = quote(cfg, settings, { start: rental.start, end: rental.end, quantity });
  const address = String(input.address || "").trim().slice(0, 500) || null;
  if ((rental.handover === "delivery" || rental.returnMethod === "collect") && !address) throw new HttpError(400, "Enter the address for delivery and pickup.");
  const title = `${variant.product.title}${variant.title !== "Default" ? ` — ${variant.title}` : ""}`;
  const booking = await prisma.rentalBooking.create({
    data: {
      storeId: store.id,
      productId: variant.productId,
      variantId: variant.id,
      title,
      customerName: name,
      phone,
      email: email || null,
      startDate: D.toDate(rental.start),
      endDate: D.toDate(rental.end),
      days: q.days,
      quantity,
      pricePerDay: q.pricePerDay,
      rentalTotal: money(q.rentalTotal * quantity),
      deposit: money(q.deposit * quantity),
      depositStatus: q.deposit > 0 ? "due" : "none",
      handover: rental.handover,
      returnMethod: rental.returnMethod,
      address,
      note: String(input.note || "").trim().slice(0, 1000) || null,
      status: "requested",
      source: "request",
    },
  });
  return booking;
}

// ── Seller side ──────────────────────────────────────────────────

function serialize(b) {
  if (!b) return b;
  const today = D.today();
  const start = D.fromDate(b.startDate);
  const end = D.fromDate(b.endDate);
  return {
    ...b,
    startDate: start,
    endDate: end,
    pricePerDay: Number(b.pricePerDay),
    rentalTotal: Number(b.rentalTotal),
    deposit: Number(b.deposit),
    lateFee: Number(b.lateFee),
    late: b.status === "out" && end < today,
    lateDays: b.status === "out" && end < today ? D.span(end, today) - 1 : 0,
    range: D.rangeLabel(start, end),
  };
}

const ORDER_SELECT = { select: { id: true, orderNumber: true, paymentStatus: true, paymentMethod: true, cancelledAt: true } };

async function withOrders(prisma, rows) {
  const ids = [...new Set(rows.map((r) => r.orderId).filter(Boolean))];
  const orders = ids.length ? await prisma.order.findMany({ where: { id: { in: ids } }, ...ORDER_SELECT }) : [];
  const byId = Object.fromEntries(orders.map((o) => [o.id, o]));
  return rows.map((r) => ({ ...serialize(r), order: r.orderId ? byId[r.orderId] || null : null }));
}

/** The "Today" board: what goes out, what comes back, what's late, and
 * requests waiting for an answer. */
async function overview(prisma, storeId, now = new Date()) {
  const today = D.today(now);
  const tomorrow = D.addDays(today, 1);
  const [goingOut, comingBack, late, requests, upcoming, products] = await Promise.all([
    prisma.rentalBooking.findMany({ where: { storeId, status: "confirmed", startDate: { lte: D.toDate(tomorrow) } }, orderBy: { startDate: "asc" }, take: 100 }),
    prisma.rentalBooking.findMany({ where: { storeId, status: "out", endDate: { gte: D.toDate(today), lte: D.toDate(tomorrow) } }, orderBy: { endDate: "asc" }, take: 100 }),
    prisma.rentalBooking.findMany({ where: { storeId, status: "out", endDate: { lt: D.toDate(today) } }, orderBy: { endDate: "asc" }, take: 100 }),
    prisma.rentalBooking.findMany({ where: { storeId, status: "requested" }, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.rentalBooking.count({ where: { storeId, status: "confirmed", startDate: { gt: D.toDate(tomorrow) } } }),
    prisma.rentalProduct.count({ where: { storeId, enabled: true } }),
  ]);
  return {
    today,
    goingOut: await withOrders(prisma, goingOut),
    comingBack: await withOrders(prisma, comingBack),
    late: await withOrders(prisma, late),
    requests: await withOrders(prisma, requests),
    upcoming,
    products,
  };
}

async function list(prisma, storeId, { status, from, to, q, productId, page = 1, pageSize = 50 } = {}) {
  const where = { storeId };
  if (status === "late") Object.assign(where, { status: "out", endDate: { lt: D.toDate(D.today()) } });
  else if (STATUSES.includes(status)) where.status = status;
  if (productId) where.productId = productId;
  if (D.isDay(from)) where.endDate = { ...(where.endDate || {}), gte: D.toDate(from) };
  if (D.isDay(to)) where.startDate = { lte: D.toDate(to) };
  if (q) {
    const term = String(q).trim().slice(0, 80);
    where.OR = [
      { customerName: { contains: term, mode: "insensitive" } },
      { phone: { contains: term } },
      { email: { contains: term, mode: "insensitive" } },
      { title: { contains: term, mode: "insensitive" } },
    ];
  }
  const [rows, total] = await Promise.all([
    prisma.rentalBooking.findMany({ where, orderBy: [{ startDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.rentalBooking.count({ where }),
  ]);
  return { bookings: await withOrders(prisma, rows), total, page, pageSize };
}

async function getBooking(prisma, storeId, id) {
  const row = await prisma.rentalBooking.findFirst({ where: { id, storeId } });
  if (!row) throw new HttpError(404, "Booking not found");
  return (await withOrders(prisma, [row]))[0];
}

/** The seller adds a booking by hand (a phone or walk-in rental), or
 * blocks days (repairs, a photo shoot). */
async function createManual(prisma, storeId, input) {
  const product = await prisma.product.findFirst({ where: { id: String(input.productId || ""), storeId }, include: { rental: true, variants: { select: { id: true, title: true } } } });
  if (!product) throw new HttpError(404, "Choose a product.");
  const cfg = configOf(product.rental);
  if (!cfg) throw new HttpError(400, "Set up renting for this product first (on the product's page).");
  const settings = (await installedSettings(prisma, storeId)) || settingsFor({});
  const block = input.kind === "block";
  const variant = input.variantId ? product.variants.find((v) => v.id === input.variantId) : null;
  if (input.variantId && !variant) throw new HttpError(400, "Choose a size of this product.");
  if (!block && !variant && product.variants.length !== 1) throw new HttpError(400, "Choose the size being rented.");
  const chosen = variant || (block ? null : product.variants[0]);
  const start = String(input.start || "");
  const end = String(input.end || input.start || "");
  const days = checkRange(cfg, settings, start, end, { seller: true });
  const quantity = int(input.quantity, 1, 99, 1);
  // A block is the seller's call — it can sit over bookings (they're told on the calendar).
  if (!input.force && chosen && !block) await assertFree(prisma, storeId, product.id, cfg, { variantId: chosen.id, start, end, quantity });
  const q = quote(cfg, settings, { start, end, quantity });
  const rentalTotal = input.rentalTotal != null && input.rentalTotal !== "" ? money(input.rentalTotal) : money(q.rentalTotal * quantity);
  const title = `${product.title}${chosen && chosen.title !== "Default" ? ` — ${chosen.title}` : block && !chosen ? " — all sizes" : ""}`;
  const row = await prisma.rentalBooking.create({
    data: {
      storeId,
      productId: product.id,
      variantId: chosen?.id || null,
      title,
      customerName: block ? null : String(input.customerName || "").trim().slice(0, 120) || null,
      phone: block ? null : String(input.phone || "").trim().slice(0, 20) || null,
      email: block ? null : String(input.email || "").trim().toLowerCase().slice(0, 200) || null,
      startDate: D.toDate(start),
      endDate: D.toDate(end),
      days,
      quantity: block && !chosen ? cfg.units : quantity,
      pricePerDay: block ? 0 : q.pricePerDay,
      rentalTotal: block ? 0 : rentalTotal,
      deposit: block ? 0 : money(input.deposit != null && input.deposit !== "" ? input.deposit : q.deposit * quantity),
      depositStatus: block ? "none" : (input.deposit ?? q.deposit) > 0 ? "due" : "none",
      handover: ["delivery", "store_pickup"].includes(input.handover) ? input.handover : "store_pickup",
      returnMethod: ["collect", "drop_off"].includes(input.returnMethod) ? input.returnMethod : "drop_off",
      address: block ? null : String(input.address || "").trim().slice(0, 500) || null,
      note: String(input.note || "").trim().slice(0, 1000) || null,
      status: block ? "blocked" : "confirmed",
      source: block ? "block" : "manual",
    },
  });
  return serialize(row);
}

/** Moves a booking along: confirm a request, hand over, take back,
 * cancel, settle the deposit, or change dates/notes. */
async function act(prisma, storeId, id, action, body = {}, now = new Date()) {
  const b = await prisma.rentalBooking.findFirst({ where: { id, storeId } });
  if (!b) throw new HttpError(404, "Booking not found");
  const settings = (await installedSettings(prisma, storeId)) || settingsFor({});
  const data = {};
  const cfgFor = async () => configOf(b.productId ? await prisma.rentalProduct.findUnique({ where: { productId: b.productId } }) : null);

  if (action === "confirm") {
    if (b.status !== "requested") throw new HttpError(400, "Only a request can be confirmed.");
    const cfg = await cfgFor();
    if (cfg && b.variantId && !body.force) await assertFree(prisma, storeId, b.productId, cfg, { variantId: b.variantId, start: D.fromDate(b.startDate), end: D.fromDate(b.endDate), quantity: b.quantity, now });
    data.status = "confirmed";
  } else if (action === "out") {
    if (!["confirmed", "requested"].includes(b.status)) throw new HttpError(400, "This booking can't be handed over now.");
    data.status = "out";
    data.outAt = now;
    if (b.depositStatus === "due" && body.depositCollected) data.depositStatus = "held";
  } else if (action === "returned") {
    if (b.status !== "out") throw new HttpError(400, "Only a booking that's out can be returned.");
    const returnedDay = D.isDay(body.returnedOn) ? body.returnedOn : D.today(now);
    const lateDays = Math.max(0, D.span(D.fromDate(b.endDate), returnedDay) - 1);
    data.status = "returned";
    data.returnedAt = D.isDay(body.returnedOn) ? D.toDate(body.returnedOn) : now;
    data.lateFee = body.lateFee != null && body.lateFee !== "" ? money(body.lateFee) : money(lateDays * settings.lateFeePerDay * b.quantity);
  } else if (action === "cancel") {
    if (["returned", "cancelled"].includes(b.status)) throw new HttpError(400, "This booking is already closed.");
    data.status = "cancelled";
  } else if (action === "deposit") {
    if (!["held", "refunded", "kept", "due"].includes(body.depositStatus)) throw new HttpError(400, "Choose what happened to the deposit.");
    data.depositStatus = body.depositStatus;
  } else if (action === "edit") {
    if (body.note !== undefined) data.note = String(body.note || "").trim().slice(0, 1000) || null;
    if (body.address !== undefined) data.address = String(body.address || "").trim().slice(0, 500) || null;
    if (body.customerName !== undefined) data.customerName = String(body.customerName || "").trim().slice(0, 120) || null;
    if (body.phone !== undefined) data.phone = String(body.phone || "").trim().slice(0, 20) || null;
    if (body.start !== undefined || body.end !== undefined) {
      const start = String(body.start ?? D.fromDate(b.startDate));
      const end = String(body.end ?? D.fromDate(b.endDate));
      const cfg = await cfgFor();
      const days = checkRange(cfg || configOf({ pricePerDay: 0 }), settings, start, end, { seller: true });
      if (cfg && b.variantId && HOLDING.includes(b.status) && !body.force) await assertFree(prisma, storeId, b.productId, cfg, { variantId: b.variantId, start, end, quantity: b.quantity, exclude: b.id, now });
      Object.assign(data, { startDate: D.toDate(start), endDate: D.toDate(end), days });
    }
  } else {
    throw new HttpError(400, "Unknown action");
  }
  const row = await prisma.rentalBooking.update({ where: { id: b.id }, data });
  return (await withOrders(prisma, [row]))[0];
}

/** A month at a glance: every rentable product (and size) and its bookings. */
async function calendar(prisma, storeId, month) {
  const m = /^\d{4}-\d{2}$/.test(String(month || "")) ? month : D.today().slice(0, 7);
  const first = `${m}-01`;
  const next = D.fromDate(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1)));
  const last = D.addDays(next, -1);
  const [products, bookings] = await Promise.all([
    prisma.rentalProduct.findMany({
      where: { storeId },
      include: { product: { select: { id: true, title: true, status: true, variants: { where: { status: "active" }, select: { id: true, title: true }, orderBy: { createdAt: "asc" } }, images: { take: 1, orderBy: { position: "asc" }, select: { url: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.rentalBooking.findMany({
      where: { storeId, status: { in: ["requested", "confirmed", "out", "returned", "blocked"] }, startDate: { lte: D.toDate(last) }, endDate: { gte: D.toDate(first) } },
      orderBy: { startDate: "asc" },
    }),
  ]);
  return {
    month: m,
    first,
    last,
    days: D.eachDay(first, last),
    products: products.map((r) => ({
      productId: r.productId,
      title: r.product.title,
      image: r.product.images[0]?.url || null,
      units: r.units,
      enabled: r.enabled,
      variants: r.product.variants,
    })),
    bookings: bookings.map(serialize),
  };
}

/** Products set up for renting, for the Rentals page. */
async function listProducts(prisma, storeId) {
  const rows = await prisma.rentalProduct.findMany({
    where: { storeId },
    include: { product: { select: { id: true, title: true, slug: true, status: true, templateSuffix: true, images: { take: 1, orderBy: { position: "asc" }, select: { url: true } }, variants: { select: { id: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const counts = await prisma.rentalBooking.groupBy({ by: ["productId"], where: { storeId, status: { in: ["confirmed", "out", "requested"] } }, _count: true });
  const byProduct = Object.fromEntries(counts.map((c) => [c.productId, c._count]));
  return rows.map((r) => ({ ...configOf(r), productId: r.productId, title: r.product.title, slug: r.product.slug, status: r.product.status, image: r.product.images[0]?.url || null, sizes: r.product.variants.length, open: byProduct[r.productId] || 0 }));
}

module.exports = {
  APP_KEY,
  DEFAULTS,
  STATUSES,
  HANDOVER_LABEL,
  RETURN_LABEL,
  settingsFor,
  installedSettings,
  configOf,
  rateFor,
  quote,
  checkRange,
  occupancy,
  fits,
  assertFree,
  bookedDays,
  getProductConfig,
  saveProductConfig,
  removeProductConfig,
  cardInfo,
  productContext,
  cartRental,
  cartLineDetails,
  bookOrder,
  releaseOrder,
  requestBooking,
  overview,
  list,
  getBooking,
  createManual,
  act,
  calendar,
  listProducts,
  serialize,
};
