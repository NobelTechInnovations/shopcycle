import Link from "next/link";
import { AlertTriangle, CalendarClock, IndianRupee, Landmark, Receipt, RotateCcw, TrendingUp, Webhook } from "lucide-react";
import { StatusBadge } from "@shopcycle/ui";
import { serverApiFetch } from "@/lib/api";
import { inr, STATUS, STATUS_ORDER, day } from "@/lib/billing";

export const dynamic = "force-dynamic";

function Tile({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-[18px] flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-ink-muted m-0">{label}</p>
        <span className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={tone === "danger" ? { background: "#FDECEC", color: "#DC2626" } : { background: "#F1EEFF", color: "#7C5CFF" }}>
          <Icon size={16} aria-hidden="true" />
        </span>
      </div>
      <p className="text-[24px] leading-tight font-semibold text-ink m-0 tabular-nums truncate" style={{ letterSpacing: "-0.02em" }}>
        {value}
      </p>
      {sub && <p className="text-xs text-ink-muted m-0">{sub}</p>}
    </div>
  );
}

function List({ title, rows, empty, right }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card">
      <h2 className="text-[15px] font-semibold text-ink m-0 px-[18px] pt-[18px] pb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted px-[18px] pb-[18px] m-0">{empty}</p>
      ) : (
        <ul className="list-none m-0 p-0">
          {rows.map((r) => (
            <li key={r.storeId} className="border-t border-app-border">
              <Link href={`/billing/subscriptions/${r.storeId}`} className="flex items-center justify-between gap-3 px-[18px] py-2.5 hover:bg-app-bg">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink truncate">{r.storeName}</span>
                  <span className="block text-xs text-ink-muted">
                    {r.plan} · {r.interval === "year" ? "yearly" : "monthly"}
                  </span>
                </span>
                {right(r)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function BillingOverviewPage() {
  const o = await serverApiFetch("/api/super-admin/billing/overview");
  const gst = o.gst.thisMonth;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <Tile icon={TrendingUp} label="MRR" value={inr(o.mrr)} sub={`ARR ${inr(o.arr)} · before GST`} />
        <Tile icon={IndianRupee} label="Collected (30 days)" value={inr(o.revenue.last30)} sub={`${o.revenue.payments30} payments · this month ${inr(o.revenue.thisMonth)}`} />
        <Tile icon={Landmark} label={`GST this month (${o.gst.rate}%)`} value={inr(gst.tax)} sub={`CGST ${inr(gst.cgst)} · SGST ${inr(gst.sgst)} · IGST ${inr(gst.igst)}`} />
        <Tile icon={Receipt} label="Checkout fees" value={inr(o.fees.paid)} sub={`collected · ${inr(o.fees.accrued + o.fees.billed)} still to collect`} />
        <Tile icon={AlertTriangle} label="Failed payments (30 days)" value={o.failedPayments30} tone={o.failedPayments30 ? "danger" : undefined} sub={`${(o.statuses.GRACE_PERIOD || 0) + (o.statuses.PAST_DUE || 0)} stores behind`} />
        <Tile icon={CalendarClock} label="Mandates" value={o.mandates.active || 0} sub={`active · ${o.mandates.pending || 0} pending · ${o.mandates.cancelled || 0} cancelled`} />
        <Tile icon={RotateCcw} label="Refunds" value={inr(o.refunds.amount)} sub={`${o.refunds.count} refunds`} />
        <Tile icon={Webhook} label="Webhooks waiting" value={o.webhookBacklog} tone={o.webhookBacklog ? "danger" : undefined} sub={o.pendingLimitRequests ? `${o.pendingLimitRequests} limit requests to review` : "none to review"} />
      </div>

      <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-[18px]">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="text-[15px] font-semibold text-ink m-0">Subscriptions by status</h2>
          <span className="text-xs text-ink-muted tabular-nums">{o.total} stores</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.map((k) => (
            <Link key={k} href={`/billing/subscriptions?status=${k}`} className="inline-flex items-center gap-2 rounded-lg border border-app-border px-3 py-2 hover:bg-app-bg">
              <StatusBadge status={STATUS[k].status} label={STATUS[k].label} />
              <span className="text-sm font-semibold text-ink tabular-nums">{o.statuses[k] || 0}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <List
          title="Needs attention"
          rows={o.atRisk}
          empty="No store is behind on billing."
          right={(r) => (
            <span className="text-right shrink-0">
              <StatusBadge status={STATUS[r.status]?.status} label={STATUS[r.status]?.label} />
              <span className="block text-xs text-ink-muted mt-0.5">
                {r.consecutiveFailures} unpaid · since {day(r.lastFailureAt)}
              </span>
            </span>
          )}
        />
        <List
          title="Renewing in the next 7 days"
          rows={o.upcomingRenewals}
          empty="No renewals this week."
          right={(r) => <span className="text-[13px] text-ink tabular-nums shrink-0">{day(r.nextBillingAt)}</span>}
        />
      </div>
    </div>
  );
}
