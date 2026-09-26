const { HttpError } = require("@shopcycle/utils");
const { formatCurrency } = require("@shopcycle/utils");
const { storeSettings } = require("../../lib/store-settings");
const { resolveState, stateFromGstin } = require("../../lib/indian-states");
const { esc } = require("../../emails/templates");
const { addOrderEvent } = require("./events");
const { round2 } = require("./quantities");

/**
 * GST tax invoices from a store to its shoppers (Premium — Plan.hasGstSoftware).
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

async function issueInvoice(prisma, store, order) {
  if (!store.plan?.hasGstSoftware) {
    throw new HttpError(403, "GST invoices are part of the Premium plan. Upgrade in Settings ▸ Plan & billing.");
  }
  if (order.invoiceNumber) return order;
  if (order.paymentStatus === "pending" && !["fulfilled", "partially_fulfilled"].includes(order.fulfillmentStatus)) {
    throw new HttpError(400, "An invoice is issued once the order is paid or shipped.");
  }
  const prefix = storeSettings(store).invoicePrefix;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { _max } = await prisma.order.aggregate({ where: { storeId: store.id }, _max: { invoiceSeq: true } });
    const seq = (_max.invoiceSeq || 0) + 1;
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
  return {
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
    },
    buyer: {
      name: order.shippingName || order.customer?.name || "",
      address: [order.shippingAddress1, order.shippingAddress2, order.shippingCity, order.shippingZip].filter(Boolean).join(", "),
      state: buyerState?.name || order.shippingProvince || null,
      stateCode: buyerState?.code || null,
      email: order.email,
      phone: order.phone,
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
    total: Number(order.total),
    refunded: Number(order.refundedAmount || 0),
    paymentMethod: order.paymentMethod,
    money: (n) => formatCurrency(n, currency),
  };
}

const td = "padding:8px 10px;border-bottom:1px solid #E6E6EA;vertical-align:top";

/** A standalone, printable HTML invoice — what the shopper opens from
 * their order page and the merchant from the admin. */
function renderInvoiceHtml(store, order) {
  const inv = buildInvoice(store, order);
  const m = inv.money;
  const date = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  const hasHsn = inv.lines.some((l) => l.hsn);
  const rows = inv.lines
    .map(
      (l, i) => `<tr>
  <td style="${td}">${i + 1}</td>
  <td style="${td}">${esc(l.title)}${l.sku ? `<div style="color:#6B6B76;font-size:12px">SKU ${esc(l.sku)}</div>` : ""}</td>
  ${hasHsn ? `<td style="${td}">${esc(l.hsn || "—")}</td>` : ""}
  <td style="${td};text-align:right">${l.quantity}</td>
  <td style="${td};text-align:right">${m(l.unitPrice)}</td>
  <td style="${td};text-align:right">${l.discount ? `−${m(l.discount)}` : "—"}</td>
  <td style="${td};text-align:right">${m(l.taxable)}</td>
  <td style="${td};text-align:right">${m(l.tax)}</td>
  <td style="${td};text-align:right;font-weight:600">${m(l.total)}</td>
</tr>`
    )
    .join("");
  const taxRows =
    inv.taxType === "igst"
      ? `<tr><td>IGST @ ${inv.ratePercent}%</td><td style="text-align:right">${m(inv.igst)}</td></tr>`
      : `<tr><td>CGST @ ${round2(inv.ratePercent / 2)}%</td><td style="text-align:right">${m(inv.cgst)}</td></tr>
         <tr><td>SGST @ ${round2(inv.ratePercent / 2)}%</td><td style="text-align:right">${m(inv.sgst)}</td></tr>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${esc(inv.number)} · ${esc(store.name)}</title>
<style>
  body{margin:0;background:#F4F4F6;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111114}
  .sheet{max-width:860px;margin:24px auto;background:#fff;border:1px solid #E6E6EA;border-radius:14px;padding:36px}
  h1{font-size:22px;margin:0;letter-spacing:-.02em} .muted{color:#6B6B76} table{border-collapse:collapse;width:100%}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:28px 0} .label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9A9AA5;margin-bottom:6px}
  .scroll{overflow-x:auto} th{font-size:12px;text-align:left;color:#6B6B76;font-weight:600;padding:8px 10px;border-bottom:1px solid #111114;white-space:nowrap}
  .totals{margin-left:auto;max-width:320px;margin-top:16px} .totals td{padding:5px 0}
  .bar{display:flex;justify-content:space-between;gap:12px;align-items:center;max-width:860px;margin:16px auto 0;padding:0 4px}
  .btn{background:#111114;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:600;cursor:pointer}
  @media (max-width:640px){.sheet{padding:22px;margin:12px;border-radius:10px}.grid{grid-template-columns:1fr}}
  @media print{body{background:#fff}.sheet{border:0;margin:0;padding:0;max-width:none}.bar{display:none}}
</style></head><body>
<div class="bar"><span class="muted">${esc(store.name)}</span><button class="btn" onclick="window.print()">Print or save as PDF</button></div>
<div class="sheet">
  <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap">
    <div><div class="label">Tax invoice</div><h1>${esc(inv.seller.name)}</h1>
      ${inv.seller.gstin ? `<div class="muted">GSTIN ${esc(inv.seller.gstin)}</div>` : `<div class="muted">Not registered under GST</div>`}</div>
    <div style="text-align:right"><div><strong>${esc(inv.number)}</strong></div>
      <div class="muted">Invoice date ${date(inv.date)}</div>
      <div class="muted">Order #${inv.orderNumber} · ${date(inv.orderDate)}</div></div>
  </div>
  <div class="grid">
    <div><div class="label">Sold by</div><div>${esc(inv.seller.name)}</div>
      ${inv.seller.address ? `<div class="muted" style="white-space:pre-line">${esc(inv.seller.address)}</div>` : ""}
      ${inv.seller.state ? `<div class="muted">${esc(inv.seller.state)}${inv.seller.stateCode ? ` (${inv.seller.stateCode})` : ""}</div>` : ""}
      ${inv.seller.email ? `<div class="muted">${esc(inv.seller.email)}</div>` : ""}</div>
    <div><div class="label">Billed and shipped to</div><div>${esc(inv.buyer.name)}</div>
      <div class="muted">${esc(inv.buyer.address)}</div>
      <div class="muted">Place of supply: ${esc(inv.placeOfSupply)}</div></div>
  </div>
  <div class="scroll"><table>
    <thead><tr><th>#</th><th>Item</th>${hasHsn ? "<th>HSN</th>" : ""}<th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Discount</th><th style="text-align:right">Taxable</th><th style="text-align:right">Tax</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <table class="totals">
    <tr><td class="muted">Taxable value</td><td style="text-align:right">${m(inv.taxable)}</td></tr>
    ${inv.taxable > 0 && inv.ratePercent > 0 ? taxRows : ""}
    ${inv.shipping > 0 ? `<tr><td class="muted">Shipping</td><td style="text-align:right">${m(inv.shipping)}</td></tr>` : ""}
    <tr><td style="border-top:1px solid #111114;padding-top:8px"><strong>Total</strong></td><td style="border-top:1px solid #111114;padding-top:8px;text-align:right"><strong>${m(inv.total)}</strong></td></tr>
    ${inv.refunded > 0 ? `<tr><td class="muted">Refunded</td><td style="text-align:right">−${m(inv.refunded)}</td></tr>` : ""}
  </table>
  <p class="muted" style="margin-top:28px;font-size:12px">${inv.paymentMethod === "cod" ? "Payment: cash on delivery." : "Payment: paid online."} This is a computer-generated invoice and needs no signature.</p>
</div></body></html>`;
}

module.exports = { issueInvoice, buildInvoice, renderInvoiceHtml, financialYear, formatNumber };
