import Link from "next/link";
import { TrendingUp, TrendingDown, Store, Hourglass, AlertTriangle, IndianRupee, ShoppingBag, Receipt } from "lucide-react";
import { PageHeader, StatusBadge } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { serverApiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

const inr = (n) => formatCurrency(n, "INR");
const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "—");

function change(now, before) {
  if (!before) return now ? null : 0;
  return Math.round(((now - before) / before) * 100);
}

function Kpi({ icon: Icon, label, value, sub, delta, tone }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-[18px] flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-ink-muted m-0">{label}</p>
        <span
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
          style={tone === "danger" ? { background: "#FDECEC", color: "#DC2626" } : tone === "accent" ? { background: "#F1EEFF", color: "#7C5CFF" } : { background: "#F7F7F8", color: "#6B6B76" }}
        >
          <Icon size={16} aria-hidden="true" />
        </span>
      </div>
      <p className="text-[26px] leading-tight font-semibold text-ink m-0 tabular-nums truncate" style={{ letterSpacing: "-0.02em" }}>
        {value}
      </p>
      <p className="text-xs text-ink-muted m-0 flex items-center gap-1.5 flex-wrap">
        {delta !== undefined && delta !== null && (
          <span className={`inline-flex items-center gap-0.5 font-medium ${delta >= 0 ? "text-[#15703A]" : "text-[#A11B1B]"}`}>
            {delta >= 0 ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
            {delta >= 0 ? "+" : ""}
            {delta}%
          </span>
        )}
        {sub}
      </p>
    </div>
  );
}

function Signups({ days }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((n, d) => n + d.count, 0);
  const W = 600;
  const H = 120;
  const gap = 4;
  const bw = (W - gap * (days.length - 1)) / days.length;
  return (
    <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-[18px]">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="text-[15px] font-semibold text-ink m-0">New stores</h2>
        <span className="text-xs text-ink-muted tabular-nums">{total} in the last 30 days</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full h-auto" role="img" aria-label={`${total} new stores in the last 30 days`}>
        {days.map((d, i) => {
          const h = d.count ? Math.max(4, (d.count / max) * H) : 2;
          return (
            <rect key={d.date} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={2} fill={d.count ? "#7C5CFF" : "#E6E6EA"}>
              <title>{`${dateLabel(d.date)}: ${d.count}`}</title>
            </rect>
          );
        })}
        <text x={0} y={H + 14} fontSize="11" fill="#6B6B76">
          {dateLabel(days[0]?.date)}
        </text>
        <text x={W} y={H + 14} fontSize="11" fill="#6B6B76" textAnchor="end">
          Today
        </text>
      </svg>
    </div>
  );
}

function StoreList({ title, empty, rows, render }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card">
      <h2 className="text-[15px] font-semibold text-ink m-0 px-[18px] pt-4 pb-3 border-b border-app-border">{title}</h2>
      {rows.length ? (
        <ul className="m-0 p-0 list-none divide-y divide-app-border">
          {rows.map((r) => (
            <li key={r.id} className="px-[18px] py-3 flex items-center justify-between gap-3 text-sm">
              {render(r)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 px-[18px] py-6 text-sm text-ink-muted">{empty}</p>
      )}
    </div>
  );
}

export default async function OverviewPage() {
  const o = await serverApiFetch("/api/super-admin/overview");
  const gmvDelta = change(o.gmv.last30, o.gmv.prev30);
  const feesOpen = o.fees.accrued + o.fees.scheduled;

  return (
    <div>
      <PageHeader title="Overview" subtitle="Subscriptions, merchant sales and stores that need attention" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Kpi icon={IndianRupee} tone="accent" label="Monthly recurring revenue" value={inr(o.mrr)} sub={`${inr(o.arr)} a year · ${o.stores.paying} paying`} />
        <Kpi icon={Hourglass} label="Stores in free trial" value={o.stores.trialing} sub={`${o.trialsEnding.length} ending in the next 7 days`} />
        <Kpi
          icon={AlertTriangle}
          tone={o.stores.pastDue ? "danger" : undefined}
          label="Payment failed"
          value={o.stores.pastDue}
          sub={o.stores.pastDue ? `${inr(o.atRisk)}/mo at risk` : "No failed renewals"}
        />
        <Kpi icon={Store} label="Stores" value={o.stores.total} sub={`${o.stores.new30} new in 30 days · ${o.stores.noPlan} without a plan${o.stores.suspended ? ` · ${o.stores.suspended} suspended` : ""}`} />
        <Kpi icon={ShoppingBag} label="Merchant sales (30 days)" value={inr(o.gmv.last30)} delta={gmvDelta} sub={`${o.gmv.orders30} paid orders`} />
        <Kpi icon={Receipt} label="Platform fees to bill" value={inr(feesOpen)} sub={`${inr(o.fees.scheduled)} on upcoming renewals · ${inr(o.fees.paid)} collected`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <StoreList
          title="Trials ending this week"
          empty="No trials end in the next 7 days."
          rows={o.trialsEnding}
          render={(s) => (
            <>
              <div className="min-w-0">
                <p className="m-0 font-medium text-ink truncate">{s.name}</p>
                <p className="m-0 text-xs text-ink-muted">{s.plan ? `${s.plan.name} · ${inr(s.plan.priceMonthly)}/mo` : "No plan"}</p>
              </div>
              <StatusBadge status="scheduled" label={`Ends ${dateLabel(s.trialEndsAt)}`} />
            </>
          )}
        />
        <StoreList
          title="Payment failed"
          empty="Every renewal went through."
          rows={o.pastDue}
          render={(s) => (
            <>
              <div className="min-w-0">
                <p className="m-0 font-medium text-ink truncate">{s.name}</p>
                <p className="m-0 text-xs text-ink-muted">{s.plan ? `${s.plan.name} · ${inr(s.plan.priceMonthly)}/mo` : "No plan"}</p>
              </div>
              <StatusBadge status="failed" label="Past due" />
            </>
          )}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Signups days={o.signupsByDay} />
        <StoreList
          title="Top stores by sales (30 days)"
          empty="No paid orders in the last 30 days."
          rows={o.topStores}
          render={(s) => (
            <>
              <div className="min-w-0">
                <p className="m-0 font-medium text-ink truncate">{s.name}</p>
                <p className="m-0 text-xs text-ink-muted">{s.orders} paid order{s.orders === 1 ? "" : "s"}</p>
              </div>
              <span className="font-medium text-ink tabular-nums">{inr(s.sales)}</span>
            </>
          )}
        />
      </div>

      <p className="text-xs text-ink-muted mt-6">
        MRR counts stores with an active paid subscription at their plan's monthly price. See <Link href="/companies" className="underline">Companies</Link> for every store.
      </p>
    </div>
  );
}
