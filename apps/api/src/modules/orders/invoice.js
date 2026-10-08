const entitlements = require("../billing/entitlements");
const { HttpError } = require("@shopcycle/utils");
const { formatCurrency } = require("@shopcycle/utils");
const { storeSettings } = require("../../lib/store-settings");
const { resolveState, stateFromGstin } = require("../../lib/indian-states");
const { esc } = require("../../emails/templates");
const { addOrderEvent } = require("./events");
const { round2 } = require("./quantities");

/**
 * GST tax invoices from a store to its shoppers (Growth and Pro — the
 * "gst_invoices" feature, billing/entitlements.js).
 *
 * Numbering: one gap-free serial per store, issued once per order and
 * never reused, formatted with the Indian financial year, e.g.
 * INV-2627-0007 for FY 2026–27 (GST allows any unique serial of up to 16
 * characters; the prefix is the store's `invoicePrefix` setting).
 *
 * Tax: the store charges one flat tax rate on (subtotal − discount) at
 * checkout, so the invoice spreads that tax across lines in proportion to
 * their value. Delivery inside the store's own state is CGST + SGST
 * (half each); anywhere else is IGST.
 *
 * Before the first invoice the seller gives their GST details (registered
 * or not, GSTIN, legal name, address, state — store.billing* and
 * settings.gstProfile). A registered seller's invoice is a "Tax invoice"
 * with the GST split; an unregistered one's is a plain "Invoice".
 *
 * Cancelling keeps the invoice as printed (cancelled_invoices) and frees
 * the order for a new one; a serial is never used twice.
 */

function financialYear(date = new Date()) {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1; // FY starts 1 April
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** INV-2627-0007: prefix (≤5 chars), financial year 2026–27 as "2627",
 * serial — 13 to 16 characters, inside GST's 16-character limit. */
function formatNumber(prefix, seq, date) {
  const clean = String(prefix || "INV").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5) || "INV";
  const fy = financialYear(date).replace(/^\d\d(\d\d)-(\d\d)$/, "$1$2");
  return `${clean}-${fy}-${String(seq).padStart(4, "0")}`;
}

/** The seller's GST details for invoices, and whether they're complete
 * enough to issue one. */
function gstProfile(store) {
  const p = (store?.settings && typeof store.settings === "object" && store.settings.gstProfile) || {};
  const registered = p.registered === undefined ? (store?.gstin ? true : null) : Boolean(p.registered);
  const missing = [];
  if (registered === null) missing.push("registered");
  if (registered && !store?.gstin) missing.push("gstin");
  if (!String(store?.billingAddress || "").trim()) missing.push("billingAddress");
  if (!store?.billingState) missing.push("billingState");
  return {
    registered,
    ready: missing.length === 0,
    missing,
    details: { billingName: store?.billingName || "", gstin: store?.gstin || "", billingAddress: store?.billingAddress || "", billingState: store?.billingState || "" },
  };
}

/** The next serial: after every invoice ever issued, cancelled ones too. */
async function nextSeq(prisma, storeId) {
  const [orders, cancelled] = await Promise.all([
    prisma.order.aggregate({ where: { storeId }, _max: { invoiceSeq: true } }),
    prisma.cancelledInvoice.aggregate({ where: { storeId }, _max: { seq: true } }),
  ]);
  return Math.max(orders._max.invoiceSeq || 0, cancelled._max.seq || 0) + 1;
}

async function issueInvoice(prisma, store, order) {
  if (!(await entitlements.storeHas(prisma, store, "gst_invoices"))) {
    throw new HttpError(403, "GST invoices aren't part of your plan. Upgrade to Growth or Pro in Settings ▸ Plan & billing.");
  }
  if (order.invoiceNumber) return order;
  if (!gstProfile(store).ready) {
    const err = new HttpError(409, "Add your GST details first — they're printed on every invoice.");
    err.code = "gst_details_needed";
    throw err;
  }
  if (order.paymentStatus === "pending" && !["fulfilled", "partially_fulfilled"].includes(order.fulfillmentStatus)) {
    throw new HttpError(400, "An invoice is issued once the order is paid or shipped.");
  }
  const prefix = storeSettings(store).invoicePrefix;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const seq = await nextSeq(prisma, store.id);
    const now = new Date();
    try {
      // `invoiceSeq: null` makes this a no-op if another request issued
      // one in the meantime; the unique (storeId, invoiceSeq) index catches
      // two orders racing for the same serial.
      const { count } = await prisma.order.updateMany({
        where: { id: order.id, storeId: store.id, invoiceSeq: null },
        data: { invoiceSeq: seq, invoiceNumber: formatNumber(prefix, seq, now), invoicedAt: now },
      });
      const fresh = await prisma.order.findUnique({ where: { id: order.id } });
      if (count === 1) {
        await addOrderEvent(prisma, order.id, { kind: "invoice", message: `GST invoice ${fresh.invoiceNumber} issued` });
      }
      return fresh;
    } catch (err) {
      if (err.code === "P2002") continue;
      throw err;
    }
  }
  throw new HttpError(503, "Couldn't allocate an invoice number — please try again.");
}

/**
 * Cancels the order's invoice: kept as printed (marked cancelled), its
 * serial retired. `reissue` gives the order a new invoice straight away
 * (with the store's current details).
 */
async function cancelInvoice(prisma, store, order, { reason, by, reissue = false, logoUrl } = {}) {
  if (!order.invoiceNumber) throw new HttpError(400, "This order has no invoice to cancel.");
  const html = renderInvoiceHtml(store, order, { logoUrl, cancelled: { at: new Date(), reason } });
  await prisma.$transaction([
    prisma.cancelledInvoice.create({
      data: { storeId: store.id, orderId: order.id, number: order.invoiceNumber, seq: order.invoiceSeq, issuedAt: order.invoicedAt, reason: reason || null, cancelledBy: by || null, html },
    }),
    prisma.order.update({ where: { id: order.id }, data: { invoiceSeq: null, invoiceNumber: null, invoicedAt: null } }),
  ]);
  await addOrderEvent(prisma, order.id, { kind: "invoice", message: `Invoice ${order.invoiceNumber} cancelled${reason ? ` — ${reason}` : ""}` });
  const fresh = await prisma.order.findUnique({ where: { id: order.id } });
  return reissue ? issueInvoice(prisma, store, { ...order, ...fresh }) : fresh;
}

/** The store's logo for invoices: the email logo, else the theme header's. */
async function invoiceLogo(prisma, store) {
  const fromEmail = store?.settings?.emailDesign?.logoUrl;
  if (/^https:\/\//.test(String(fromEmail || ""))) return fromEmail;
  const theme = await prisma.theme.findFirst({ where: { storeId: store.id, isActive: true }, select: { settingsData: true } }).catch(() => null);
  const header = theme?.settingsData?.sections?.header || {};
  const logo = header.logo ?? header.settings?.logo;
  const url = typeof logo === "string" ? logo : logo?.url;
  return /^https?:\/\//.test(String(url || "")) ? url : null;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function words99(n) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}
function words999(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? words99(r) : ""].filter(Boolean).join(" ");
}
/** 1234567.5 → "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty
 * Seven and Fifty Paise Only" (Indian numbering, as invoices are written). */
function amountInWords(amount) {
  const paise = Math.round(Number(amount || 0) * 100);
  let n = Math.floor(paise / 100);
  const p = paise % 100;
  const parts = [];
  for (const [size, name] of [[10000000, "Crore"], [100000, "Lakh"], [1000, "Thousand"]]) {
    if (n >= size) {
      parts.push(`${size === 10000000 ? amountInWordsInt(Math.floor(n / size)) : words99(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n) parts.push(words999(n));
  const rupees = parts.join(" ") || "Zero";
  return `Rupees ${rupees}${p ? ` and ${words99(p)} Paise` : ""} Only`;
}
const amountInWordsInt = (n) => amountInWords(n).replace(/^Rupees /, "").replace(/ Only$/, "");

/** Everything printed on the invoice, computed from the order. */
function buildInvoice(store, order) {
  const currency = order.currency || "INR";
  const sellerState = resolveState(store.billingState) || stateFromGstin(store.gstin);
  const buyerState = resolveState(order.shippingProvince);
  const interState = Boolean(sellerState && buyerState && sellerState.code !== buyerState.code);

  const itemsTotal = order.items.reduce((sum, i) => sum + Number(i.total), 0);
  const discount = Number(order.discount || 0);
  const taxTotal = Number(order.tax || 0);
  const taxableTotal = Math.max(itemsTotal - discount, 0);
  const rate = taxableTotal > 0 ? (taxTotal / taxableTotal) * 100 : 0;

  // Spread discount and tax over lines by value; the last line absorbs
  // rounding so the lines add up to the order exactly.
  let discountLeft = discount;
  let taxLeft = taxTotal;
  const lines = order.items.map((item, index) => {
    const last = index === order.items.length - 1;
    const share = itemsTotal > 0 ? Number(item.total) / itemsTotal : 0;
    const lineDiscount = last ? round2(discountLeft) : round2(discount * share);
    const taxable = round2(Number(item.total) - lineDiscount);
    const tax = last ? round2(taxLeft) : round2(taxTotal * share);
    discountLeft -= lineDiscount;
    taxLeft -= tax;
    return {
      title: item.title,
      sku: item.sku,
      hsn: item.product?.hsnCode || null,
      quantity: item.quantity,
      unitPrice: Number(item.price),
      discount: lineDiscount,
      taxable,
      tax,
      total: round2(taxable + tax),
    };
  });

  const half = round2(taxTotal / 2);
  const profile = gstProfile(store);
  return {
    registered: profile.registered !== false,
    number: order.invoiceNumber,
    date: order.invoicedAt,
    orderNumber: order.orderNumber,
    orderDate: order.createdAt,
    currency,
    seller: {
      name: store.billingName || store.name,
      gstin: store.gstin || null,
      address: store.billingAddress || null,
      state: sellerState?.name || store.billingState || null,
      stateCode: sellerState?.code || null,
      email: store.supportEmail || null,
      phone: store.supportPhone || null,
      website: store.customDomain ? `https://${store.customDomain}` : null,
    },
    buyer: {
      name: order.shippingName || order.customer?.name || "",
      address: [order.shippingAddress1, order.shippingAddress2, order.shippingCity, order.shippingZip].filter(Boolean).join(", "),
      state: buyerState?.name || order.shippingProvince || null,
      stateCode: buyerState?.code || null,
      email: order.email,
      phone: order.phone,
      company: order.buyerCompany || null,
      gstin: order.buyerGstin || null,
    },
    placeOfSupply: buyerState ? `${buyerState.name} (${buyerState.code})` : order.shippingProvince || "—",
    lines,
    ratePercent: round2(rate),
    taxable: round2(taxableTotal),
    taxType: interState ? "igst" : "cgst_sgst",
    cgst: interState ? 0 : half,
    sgst: interState ? 0 : round2(taxTotal - half),
    igst: interState ? round2(taxTotal) : 0,
    shipping: Number(order.shipping || 0),
    giftCard: Number(order.giftCardAmount || 0),
    total: Number(order.total),
    totalInWords: amountInWords(Number(order.total)),
    refunded: Number(order.refundedAmount || 0),
    paymentMethod: order.paymentMethod,
    money: (n) => formatCurrency(n, currency),
  };
}

/**
 * A standalone, printable invoice (A4) — what the shopper opens from their
 * order page and the merchant from the admin. `cancelled` marks a copy
 * kept after cancelling.
 */
function renderInvoiceHtml(store, order, { logoUrl, cancelled } = {}) {
  const inv = buildInvoice(store, order);
  const m = inv.money;
  const date = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—");
  const hasHsn = inv.lines.some((l) => l.hsn);
  const gst = inv.registered && inv.ratePercent > 0;
  const igst = inv.taxType === "igst";
  const half = round2(inv.ratePercent / 2);
  const title = inv.registered ? "Tax Invoice" : "Invoice";
  const taxCells = (l) => {
    if (!gst) return inv.ratePercent > 0 ? `<td class="r">${m(l.tax)}</td>` : "";
    if (igst) return `<td class="r">${inv.ratePercent}%</td><td class="r">${m(l.tax)}</td>`;
    const c = round2(l.tax / 2);
    return `<td class="r">${half}%</td><td class="r">${m(c)}</td><td class="r">${half}%</td><td class="r">${m(round2(l.tax - c))}</td>`;
  };
  const taxHead = !gst
    ? inv.ratePercent > 0
      ? `<th class="r">Tax</th>`
      : ""
    : igst
      ? `<th class="r">IGST %</th><th class="r">IGST</th>`
      : `<th class="r">CGST %</th><th class="r">CGST</th><th class="r">SGST %</th><th class="r">SGST</th>`;
  const rows = inv.lines
    .map(
      (l, i) => `<tr>
  <td>${i + 1}</td>
  <td class="item">${esc(l.title)}${l.sku ? `<div class="sub">SKU ${esc(l.sku)}</div>` : ""}</td>
  ${hasHsn ? `<td>${esc(l.hsn || "—")}</td>` : ""}
  <td class="r">${l.quantity}</td>
  <td class="r">${m(l.unitPrice)}</td>
  <td class="r">${l.discount ? m(l.discount) : "—"}</td>
  <td class="r">${m(l.taxable)}</td>
  ${taxCells(l)}
  <td class="r b">${m(l.total)}</td>
</tr>`
    )
    .join("");
  const taxRows = !gst
    ? inv.ratePercent > 0
      ? `<tr><td>Tax</td><td class="r">${m(inv.cgst + inv.sgst + inv.igst)}</td></tr>`
      : ""
    : igst
      ? `<tr><td>IGST @ ${inv.ratePercent}%</td><td class="r">${m(inv.igst)}</td></tr>`
      : `<tr><td>CGST @ ${half}%</td><td class="r">${m(inv.cgst)}</td></tr><tr><td>SGST @ ${half}%</td><td class="r">${m(inv.sgst)}</td></tr>`;
  const s = inv.seller;
  const b = inv.buyer;
  const pay = inv.paymentMethod === "cod" ? "Cash on delivery" : inv.paymentMethod === "upi_qr" ? "UPI" : inv.paymentMethod === "gift_card" ? "Gift card" : "Paid online";
  const stamp = cancelled
    ? `<div class="void">CANCELLED</div><p class="voidnote">Cancelled on ${date(cancelled.at)}${cancelled.reason ? ` — ${esc(cancelled.reason)}` : ""}. Not valid for tax.</p>`
    : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} ${esc(inv.number || "")} · ${esc(store.name)}</title>
<style>
  @page{size:A4;margin:12mm}
  *{box-sizing:border-box}
  body{margin:0;background:#EEF0F3;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#15161A;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .bar{display:flex;justify-content:space-between;gap:12px;align-items:center;max-width:210mm;margin:18px auto 0;padding:0 4px;color:#5B5E68}
  .btn{background:#15161A;color:#fff;border:0;border-radius:8px;padding:9px 16px;font:600 13px/1 inherit;cursor:pointer}
  .page{position:relative;width:210mm;min-height:297mm;margin:12px auto 32px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08),0 8px 24px rgba(0,0,0,.06);padding:14mm 13mm;overflow:hidden}
  .head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:14px;border-bottom:2px solid #15161A}
  .brand{display:flex;gap:14px;align-items:flex-start;min-width:0}
  .brand img{max-height:56px;max-width:150px;object-fit:contain}
  .brand h1{margin:0;font-size:19px;letter-spacing:-.01em}
  .muted{color:#5B5E68} .sub{color:#5B5E68;font-size:11px}
  .doc{text-align:right;flex-shrink:0}
  .doc .t{font-size:20px;font-weight:700;letter-spacing:.02em;text-transform:uppercase}
  .doc .copy{font-size:10px;letter-spacing:.08em;color:#5B5E68;text-transform:uppercase}
  .meta{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #D9DCE1;border-radius:6px;margin:14px 0}
  .meta>div{padding:8px 10px;border-right:1px solid #D9DCE1} .meta>div:last-child{border-right:0}
  .k{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#7A7D87;margin-bottom:2px}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #D9DCE1;border-radius:6px;margin-bottom:14px}
  .parties>div{padding:10px 12px} .parties>div+div{border-left:1px solid #D9DCE1}
  .parties .name{font-weight:600;font-size:13.5px}
  table{border-collapse:collapse;width:100%}
  .items{font-size:11.5px;table-layout:auto}
  .items th{background:#F3F4F6;color:#3A3D45;font-weight:600;text-align:left;padding:7px 6px;border-top:1px solid #D9DCE1;border-bottom:1px solid #D9DCE1;white-space:nowrap;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em}
  .items td{padding:7px 6px;border-bottom:1px solid #E7E9ED;vertical-align:top}
  .items .item{min-width:140px;word-break:break-word}
  .r{text-align:right;white-space:nowrap} .b{font-weight:600}
  .foot{display:grid;grid-template-columns:1fr 280px;gap:20px;margin-top:14px;align-items:start}
  .totals td{padding:4px 0} .totals .grand td{border-top:2px solid #15161A;padding-top:7px;font-size:15px;font-weight:700}
  .words{border:1px dashed #C9CCD3;border-radius:6px;padding:8px 10px;font-size:12px}
  .sign{margin-top:36px;text-align:right;font-size:12px}
  .sign .line{display:inline-block;min-width:180px;border-top:1px solid #15161A;padding-top:4px;margin-top:34px}
  .note{margin-top:22px;padding-top:10px;border-top:1px solid #E7E9ED;font-size:10.5px;color:#7A7D87;display:flex;justify-content:space-between;gap:12px}
  .void{position:absolute;top:42%;left:50%;transform:translate(-50%,-50%) rotate(-24deg);font-size:96px;font-weight:800;color:rgba(185,28,28,.14);letter-spacing:.06em;pointer-events:none}
  .voidnote{margin:0 0 10px;padding:8px 10px;border-radius:6px;background:#FEF2F2;color:#991B1B;font-weight:600}
  @media (max-width:820px){.page{width:auto;min-height:0;margin:10px;padding:18px}.meta{grid-template-columns:1fr 1fr}.meta>div:nth-child(2){border-right:0}.meta>div:nth-child(-n+2){border-bottom:1px solid #D9DCE1}.parties,.foot{grid-template-columns:1fr}.parties>div+div{border-left:0;border-top:1px solid #D9DCE1}.scroll{overflow-x:auto}}
  @media print{body{background:#fff}.bar{display:none}.page{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.items tr{break-inside:avoid}.foot{break-inside:avoid}}
</style></head><body>
<div class="bar"><span>${esc(store.name)} · ${esc(inv.number || "")}</span><button class="btn" onclick="window.print()">Print or save as PDF</button></div>
<div class="page">
  ${stamp}
  <div class="head">
    <div class="brand">
      ${logoUrl ? `<img src="${esc(logoUrl)}" alt="">` : ""}
      <div><h1>${esc(s.name)}</h1>
        ${s.address ? `<div class="muted" style="white-space:pre-line">${esc(s.address)}</div>` : ""}
        ${s.state ? `<div class="muted">${esc(s.state)}${s.stateCode ? ` · State code ${s.stateCode}` : ""}</div>` : ""}
        <div class="muted">${[s.phone, s.email].filter(Boolean).map(esc).join(" · ")}</div>
        ${inv.registered && s.gstin ? `<div style="margin-top:3px"><b>GSTIN</b> ${esc(s.gstin)}</div>` : `<div class="muted" style="margin-top:3px">Not registered under GST</div>`}
      </div>
    </div>
    <div class="doc"><div class="t">${title}</div><div class="copy">Original for recipient</div></div>
  </div>

  <div class="meta">
    <div><div class="k">Invoice no.</div><b>${esc(inv.number || "—")}</b></div>
    <div><div class="k">Invoice date</div>${date(inv.date)}</div>
    <div><div class="k">Order</div>#${inv.orderNumber} · ${date(inv.orderDate)}</div>
    <div><div class="k">Place of supply</div>${esc(inv.placeOfSupply)}</div>
  </div>

  <div class="parties">
    <div><div class="k">Bill to</div><div class="name">${esc(b.company || b.name)}</div>
      ${b.company ? `<div>${esc(b.name)}</div>` : ""}
      <div class="muted">${esc(b.address)}</div>
      ${b.state ? `<div class="muted">${esc(b.state)}${b.stateCode ? ` · State code ${b.stateCode}` : ""}</div>` : ""}
      ${b.gstin ? `<div style="margin-top:3px"><b>GSTIN</b> ${esc(b.gstin)}</div>` : ""}</div>
    <div><div class="k">Ship to</div><div class="name">${esc(b.name)}</div>
      <div class="muted">${esc(b.address)}</div>
      <div class="muted">${[b.phone, b.email].filter(Boolean).map(esc).join(" · ")}</div></div>
  </div>

  <div class="scroll"><table class="items">
    <thead><tr><th>#</th><th>Item</th>${hasHsn ? "<th>HSN</th>" : ""}<th class="r">Qty</th><th class="r">Rate</th><th class="r">Disc.</th><th class="r">Taxable</th>${taxHead}<th class="r">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>

  <div class="foot">
    <div>
      <div class="words"><div class="k">Amount in words</div>${esc(inv.totalInWords)}</div>
      <p class="muted" style="margin:10px 0 0;font-size:12px">Payment: <b style="color:#15161A">${pay}</b>${inv.giftCard > 0 ? ` · ${m(inv.giftCard)} by gift card` : ""}${gst ? ` · Tax payable on reverse charge: No` : ""}</p>
    </div>
    <table class="totals">
      <tr><td class="muted">Taxable value</td><td class="r">${m(inv.taxable)}</td></tr>
      ${inv.taxable > 0 ? taxRows : ""}
      ${inv.shipping > 0 ? `<tr><td class="muted">Shipping</td><td class="r">${m(inv.shipping)}</td></tr>` : ""}
      <tr class="grand"><td>Total</td><td class="r">${m(inv.total)}</td></tr>
      ${inv.refunded > 0 ? `<tr><td class="muted">Refunded</td><td class="r">−${m(inv.refunded)}</td></tr>` : ""}
    </table>
  </div>

  <div class="sign">For <b>${esc(s.name)}</b><br><span class="line">Authorised signatory</span></div>

  <div class="note"><span>This is a computer-generated invoice and needs no signature.</span><span>${esc(store.name)}</span></div>
</div></body></html>`;
}

/** The order's tax as shown to the shopper: "CGST 2.5%" + "SGST 2.5%",
 * "IGST 5%", or one "Tax" line for a store not registered under GST. */
function taxLines(store, order) {
  if (!(Number(order.tax) > 0) || !order.items?.length) return [];
  const inv = buildInvoice(store, order);
  if (!inv.registered || !inv.ratePercent) return [{ label: "Tax", amount: Number(order.tax) }];
  if (inv.taxType === "igst") return [{ label: `IGST ${inv.ratePercent}%`, amount: inv.igst }];
  const half = round2(inv.ratePercent / 2);
  return [
    { label: `CGST ${half}%`, amount: inv.cgst },
    { label: `SGST ${half}%`, amount: inv.sgst },
  ];
}

module.exports = { taxLines, issueInvoice, cancelInvoice, gstProfile, invoiceLogo, buildInvoice, renderInvoiceHtml, amountInWords, financialYear, formatNumber };
