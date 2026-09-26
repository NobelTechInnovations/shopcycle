"use client";

import Link from "next/link";
import { Button } from "antd";
import { Printer, ArrowLeft } from "lucide-react";
import { BrandMark, StatusBadge } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { formatDate } from "@/lib/plans";
import { amountInWords } from "@/lib/amount-in-words";

function Party({ label, party }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle m-0 mb-1.5">{label}</p>
      <p className="text-sm font-semibold text-ink m-0">{party.name}</p>
      {party.address && <p className="text-[13px] text-ink-muted m-0 whitespace-pre-line leading-relaxed">{party.address}</p>}
      {party.state && <p className="text-[13px] text-ink-muted m-0">{party.state}</p>}
      <p className="text-[13px] text-ink m-0 mt-1.5">
        GSTIN: <span className="font-mono">{party.gstin || (label === "From" ? "Registration pending" : "Unregistered")}</span>
      </p>
    </div>
  );
}

/** A GST tax invoice from Oyklane to the store — laid out for the screen
 * and for print (the admin chrome is hidden with `print:` utilities, so
 * "Print" or "Save as PDF" gives a clean document). */
export function InvoiceView({ invoice }) {
  const { seller, buyer, lines } = invoice;
  const showSac = Boolean(seller.sac);
  const half = Math.round((Number(invoice.taxAmount) / 2) * 100) / 100;
  const cgstSgst = invoice.taxType === "cgst_sgst";
  const placeOfSupply = buyer.state || seller.state;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 print:hidden">
        <Link href="/admin/settings/billing" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft size={15} aria-hidden="true" /> Plan & billing
        </Link>
        <Button icon={<Printer size={15} aria-hidden="true" />} onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>

      <article className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-8 sm:p-10 max-w-3xl print:shadow-none print:border-0 print:p-0 print:max-w-none">
        <header className="flex flex-wrap items-start justify-between gap-6 pb-6 border-b border-app-border">
          <div>
            <BrandMark size={26} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle mt-5 mb-1">Tax invoice</p>
            <h2 className="text-2xl font-semibold text-ink m-0 font-mono" style={{ letterSpacing: "-0.01em" }}>
              {invoice.number}
            </h2>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-5 gap-y-1.5 text-[13px] m-0">
            <dt className="text-ink-muted">Invoice date</dt>
            <dd className="m-0 text-ink text-right">{formatDate(invoice.issuedAt)}</dd>
            {invoice.periodStart && (
              <>
                <dt className="text-ink-muted">Service period</dt>
                <dd className="m-0 text-ink text-right">
                  {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
                </dd>
              </>
            )}
            <dt className="text-ink-muted">Place of supply</dt>
            <dd className="m-0 text-ink text-right">{placeOfSupply}</dd>
            <dt className="text-ink-muted">Status</dt>
            <dd className="m-0 text-right">
              <StatusBadge status={invoice.status} />
            </dd>
          </dl>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-app-border">
          <Party label="From" party={seller} />
          <Party label="Bill to" party={buyer} />
        </section>

        <section className="py-6">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr className="text-left text-ink-muted border-b border-app-border">
                  <th className="font-medium py-2 pr-3 w-8">#</th>
                  <th className="font-medium py-2 pr-3">Description</th>
                  {showSac && <th className="font-medium py-2 pr-3">SAC</th>}
                  <th className="font-medium py-2 text-right">Amount (incl. GST)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="border-b border-app-border align-top">
                    <td className="py-3 pr-3 text-ink-muted tabular-nums">{i + 1}</td>
                    <td className="py-3 pr-3 text-ink">{line.description}</td>
                    {showSac && <td className="py-3 pr-3 font-mono text-ink-muted">{seller.sac}</td>}
                    <td className="py-3 text-right tabular-nums text-ink">{formatCurrency(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mt-5">
            <dl className="w-full max-w-xs grid grid-cols-[1fr_auto] gap-y-1.5 text-[13px] m-0">
              <dt className="text-ink-muted">Taxable value</dt>
              <dd className="m-0 text-right tabular-nums">{formatCurrency(invoice.taxableValue)}</dd>
              {cgstSgst ? (
                <>
                  <dt className="text-ink-muted">CGST @ 9%</dt>
                  <dd className="m-0 text-right tabular-nums">{formatCurrency(half)}</dd>
                  <dt className="text-ink-muted">SGST @ 9%</dt>
                  <dd className="m-0 text-right tabular-nums">{formatCurrency(Number(invoice.taxAmount) - half)}</dd>
                </>
              ) : (
                <>
                  <dt className="text-ink-muted">IGST @ 18%</dt>
                  <dd className="m-0 text-right tabular-nums">{formatCurrency(invoice.taxAmount)}</dd>
                </>
              )}
              <dt className="text-ink font-semibold pt-2 mt-1 border-t border-app-border">Total</dt>
              <dd className="m-0 text-right tabular-nums text-ink font-semibold text-base pt-2 mt-1 border-t border-app-border">
                {formatCurrency(invoice.total)}
              </dd>
            </dl>
          </div>
          <p className="text-[13px] text-ink mt-4 mb-0 text-right">{amountInWords(invoice.total)}</p>
        </section>

        <footer className="pt-6 border-t border-app-border text-xs text-ink-muted leading-relaxed">
          {invoice.status === "paid" && <p className="m-0">Paid by automatic debit via Razorpay{invoice.razorpayPaymentId ? ` (${invoice.razorpayPaymentId})` : ""}.</p>}
          <p className="m-0">Amounts include GST at 18%. This is a computer-generated invoice and needs no signature.</p>
        </footer>
      </article>
    </div>
  );
}
