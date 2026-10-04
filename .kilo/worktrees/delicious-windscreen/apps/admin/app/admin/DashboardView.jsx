"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Table, Button, Segmented, Skeleton } from "antd";
import {
  ShoppingCart,
  Package,
  Check,
  ArrowRight,
  ExternalLink,
  Palette,
  Layers,
  Truck,
  CreditCard,
  Globe,
  ChevronRight,
  PackageX,
  PackageMinus,
  Wallet,
  PartyPopper,
} from "lucide-react";
import { StatusBadge, EmptyState } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";
import { storefrontUrlFor, storefrontLabelFor } from "@/lib/storefront";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { AreaChart, BarList, Delta, formatValue } from "@/components/charts";

function orderDate(value) {
  const d = new Date(value);
  const today = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const columns = [
  { title: "Order", dataIndex: "orderNumber", render: (n) => <span className="font-medium">#{n}</span> },
  { title: "Date", dataIndex: "createdAt", responsive: ["md"], render: (d) => <span className="text-ink-muted">{orderDate(d)}</span> },
  { title: "Customer", responsive: ["sm"], render: (_, row) => row.customer?.name || row.shippingName || "—" },
  { title: "Total", dataIndex: "total", align: "right", render: (value) => <span className="tabular-nums">{formatCurrency(value)}</span> },
  { title: "Payment", dataIndex: "paymentStatus", responsive: ["md"], render: (status) => <StatusBadge status={status} /> },
  { title: "Fulfillment", dataIndex: "fulfillmentStatus", render: (status) => <StatusBadge status={status} /> },
];

// Order matters — this is the order a new merchant should actually do them
// in. `done` keys map 1:1 to the API's data-derived `setup` flags.
const SETUP_STEPS = [
  {
    key: "hasProduct",
    icon: Package,
    title: "Add your first product",
    text: "Photos, a price, and a description are all a product needs to start selling.",
    cta: "Add product",
    href: "/admin/products/new",
  },
  {
    key: "hasCollection",
    icon: Layers,
    title: "Group products into a collection",
    text: "Collections power your menu, homepage sections, and category pages.",
    cta: "Create collection",
    href: "/admin/collections/new",
  },
  {
    key: "hasShipping",
    icon: Truck,
    title: "Set your shipping rates",
    text: "Decide where you deliver and what customers pay for it at checkout.",
    cta: "Set up shipping",
    href: "/admin/settings/shipping",
  },
  {
    key: "hasPlan",
    icon: CreditCard,
    title: "Turn on autopay",
    text: "Keep your store running when the free trial ends — your first month after the trial is just ₹99.",
    cta: "Set up billing",
    href: "/admin/settings/billing",
  },
  {
    key: "hasDomain",
    icon: Globe,
    title: "Connect your own domain",
    text: "Optional — your store already works on its free Oyklane address.",
    cta: "Add domain",
    href: "/admin/settings/domains",
  },
];

const RANGES = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
];
const PREVIOUS = { today: "yesterday", "7d": "the previous 7 days", "30d": "the previous 30 days" };

// The performance card's metrics; `perDay` builds the chart from the series.
const METRICS = [
  { key: "sessions", label: "Sessions", perDay: (d) => d.sessions },
  { key: "sales", label: "Total sales", kind: "currency", perDay: (d) => d.sales },
  { key: "orders", label: "Orders", perDay: (d) => d.orders },
  { key: "conversionRate", label: "Conversion rate", kind: "percent", perDay: (d) => (d.sessions ? Math.min(100, (d.orders / d.sessions) * 100) : 0) },
];

function greetingFor(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Shopify-style: the headline numbers as tabs; the chosen one is charted. */
function Performance({ range }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metric, setMetric] = useState("sales");

  const load = useCallback(async (r) => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch(`/api/analytics/overview?range=${r}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load(range);
  }, [load, range]);

  const active = METRICS.find((m) => m.key === metric);
  const points = (data?.series || []).map((d) => ({ date: d.date, value: active.perDay(d) }));

  return (
    <Card size="small" className="!shadow-card mb-5 overflow-hidden" styles={{ body: { padding: 0 } }}>
      <div role="tablist" aria-label="Store performance" className="grid grid-cols-2 lg:grid-cols-4 border-b border-app-border">
        {METRICS.map((m, i) => {
          const selected = m.key === metric;
          return (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setMetric(m.key)}
              // 2×2 on small screens, one row of 4 from lg: hairlines between cells.
              className={`relative text-left px-5 py-4 bg-transparent cursor-pointer transition-colors border-app-border ${i % 2 ? "border-l" : ""} ${
                i === 2 ? "lg:border-l" : ""
              } ${i > 1 ? "border-t lg:border-t-0" : ""} ${selected ? "bg-app-bg/70" : "hover:bg-app-bg/50"}`}
            >
              <span className={`text-[13px] underline decoration-dotted underline-offset-4 ${selected ? "text-ink decoration-ink/40" : "text-ink-muted decoration-ink/20"}`}>{m.label}</span>
              <span className="flex items-baseline gap-2 mt-1.5">
                <span className="text-[22px] leading-7 font-semibold text-ink whitespace-nowrap" style={{ letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                  {data ? formatValue(data.totals[m.key], m.kind) : <Skeleton.Input active size="small" style={{ width: 80, height: 22 }} />}
                </span>
                {data && <Delta current={data.totals[m.key]} previous={data.previous[m.key]} periodLabel={PREVIOUS[range]} />}
              </span>
              {selected && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-ink" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className={`px-4 pt-4 pb-2 transition-opacity ${loading && data ? "opacity-50" : ""}`}>
        {error ? (
          <p className="text-sm text-status-danger m-0 py-8 text-center">{error}</p>
        ) : !data ? (
          <Skeleton active paragraph={{ rows: 5 }} title={false} />
        ) : range === "today" ? (
          <div className="grid gap-6 sm:grid-cols-2 py-2">
            <div>
              <h3 className="text-[13px] font-medium text-ink-muted m-0 mb-3">Top products today</h3>
              <BarList items={data.topProducts} labelKey="title" valueKey="revenue" kind="currency" empty="No sales yet today." />
            </div>
            <div>
              <h3 className="text-[13px] font-medium text-ink-muted m-0 mb-3">Where visitors came from</h3>
              <BarList items={data.bySource} labelKey="source" renderLabel={(s) => `${s.source}${s.medium ? ` / ${s.medium}` : ""}`} empty="No visits yet today." />
            </div>
          </div>
        ) : (
          <AreaChart points={points} kind={active.kind} label={active.label} height={240} />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-app-border text-[13px]">
        <span className="text-ink-muted">Compared with {PREVIOUS[range]}</span>
        <Link href="/admin/analytics" className="inline-flex items-center gap-1 font-medium">
          View analytics <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}

/** Work waiting on the seller, each a link to the filtered list. */
function ToDo({ todo }) {
  const items = [
    todo.toFulfill > 0 && { icon: ShoppingCart, text: `${todo.toFulfill} order${todo.toFulfill === 1 ? "" : "s"} to fulfill`, href: "/admin/orders?status=unfulfilled", tone: "text-status-warning" },
    todo.unpaid > 0 && { icon: Wallet, text: `${todo.unpaid} order${todo.unpaid === 1 ? "" : "s"} awaiting payment`, href: "/admin/orders?status=unpaid", tone: "text-ink" },
    todo.outOfStock > 0 && { icon: PackageX, text: `${todo.outOfStock} variant${todo.outOfStock === 1 ? "" : "s"} out of stock`, href: "/admin/products/inventory?filter=out", tone: "text-status-danger" },
    todo.lowStock > 0 && { icon: PackageMinus, text: `${todo.lowStock} running low (≤ ${todo.lowStockThreshold} left)`, href: "/admin/products/inventory?filter=low", tone: "text-status-warning" },
  ].filter(Boolean);

  if (!items.length) {
    return (
      <div className="flex items-center gap-2.5 rounded-[14px] border border-app-border bg-app-surface shadow-card px-4 py-3 mb-5 text-sm text-ink">
        <PartyPopper size={16} className="text-status-success shrink-0" aria-hidden="true" />
        You&apos;re all caught up — no orders or stock need your attention.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="group inline-flex items-center gap-2 rounded-full border border-app-border bg-app-surface shadow-card pl-3 pr-2.5 py-1.5 text-[13px] font-medium text-ink no-underline hover:border-ink/30 transition-colors"
          >
            <Icon size={15} className={item.tone} aria-hidden="true" />
            {item.text}
            <ChevronRight size={14} className="text-ink-subtle group-hover:text-ink transition-colors" aria-hidden="true" />
          </Link>
        );
      })}
    </div>
  );
}

function SetupGuide({ setup }) {
  const doneCount = SETUP_STEPS.filter((s) => setup[s.key]).length;
  const total = SETUP_STEPS.length;
  // Open the first incomplete step by default — the one thing to do next.
  const firstOpen = SETUP_STEPS.find((s) => !setup[s.key])?.key;
  const [expanded, setExpanded] = useState(firstOpen);

  if (doneCount === total) return null;

  return (
    <Card size="small" className="!shadow-card mb-5" styles={{ body: { padding: 0 } }}>
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink m-0">Set up your store</h2>
            <p className="text-[13px] text-ink-muted mt-1 mb-0">Finish these steps to start taking orders.</p>
          </div>
          <span className="text-[13px] text-ink-muted tabular-nums shrink-0">
            {doneCount} of {total} done
          </span>
        </div>
        <div
          className="mt-4 h-1.5 rounded-full bg-app-bg overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={doneCount}
          aria-label="Setup progress"
        >
          <div
            className="h-full rounded-full bg-brand-gradient transition-[width] duration-500"
            style={{ width: `${Math.max(4, (doneCount / total) * 100)}%` }}
          />
        </div>
      </div>

      <ul className="list-none m-0 p-2 border-t border-app-border">
        {SETUP_STEPS.map((step) => {
          const done = setup[step.key];
          const open = expanded === step.key;
          const Icon = step.icon;
          return (
            <li key={step.key} className={`rounded-md ${open ? "bg-app-bg" : ""}`}>
              <button
                type="button"
                onClick={() => setExpanded(open ? null : step.key)}
                aria-expanded={open}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left bg-transparent border-0 cursor-pointer rounded-md hover:bg-app-bg"
              >
                <span
                  className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 ${
                    done ? "bg-ink text-white" : "border-[1.5px] border-dashed border-ink-subtle"
                  }`}
                >
                  {done && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                </span>
                <span className={`text-sm ${done ? "text-ink-muted line-through decoration-ink-subtle" : "text-ink font-medium"}`}>
                  {step.title}
                </span>
                <span className="sr-only">{done ? "(done)" : "(to do)"}</span>
              </button>
              {open && !done && (
                <div className="flex items-start gap-4 pl-[46px] pr-3 pb-4">
                  <div className="flex-1">
                    <p className="text-[13px] text-ink-muted mt-0 mb-3 leading-relaxed">{step.text}</p>
                    <Link href={step.href}>
                      <Button type="primary">{step.cta}</Button>
                    </Link>
                  </div>
                  <span className="hidden sm:flex w-14 h-14 rounded-lg bg-accent-soft text-accent items-center justify-center shrink-0">
                    <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function DashboardView({ data, user }) {
  const router = useRouter();
  const { todo, recentOrders, storeStatus, setup, store, greetingName } = data;
  const [range, setRange] = useState("7d");
  // The greeting depends on the viewer's own clock — computed after mount
  // so server-rendered HTML (server's timezone) never disagrees with the
  // client and trips a hydration mismatch.
  const [greeting, setGreeting] = useState("Welcome back");
  useEffect(() => setGreeting(greetingFor(new Date().getHours())), []);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[22px] font-semibold text-ink m-0" style={{ letterSpacing: "-0.02em" }}>
            {greeting}
            {greetingName ? `, ${greetingName}` : ""}
          </h1>
          <p className="text-sm text-ink-muted mt-1 mb-0">Here&apos;s how {store?.name || "your store"} is doing.</p>
        </div>
        <Segmented options={RANGES} value={range} onChange={setRange} />
      </div>

      {user && !user.emailVerified && <VerifyEmailBanner email={user.email} />}

      <Performance range={range} />
      {todo && <ToDo todo={todo} />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 min-w-0">
          {setup && <SetupGuide setup={setup} />}

          <Card
            size="small"
            className="!shadow-card"
            title="Recent orders"
            extra={
              <Link href="/admin/orders" className="text-[13px] inline-flex items-center gap-1">
                View all <ArrowRight size={13} aria-hidden="true" />
              </Link>
            }
            styles={{ body: { padding: 0 } }}
          >
            <Table
              rowKey="id"
              columns={columns}
              dataSource={recentOrders}
              pagination={false}
              rowClassName="cursor-pointer"
              onRow={(row) => ({ onClick: () => router.push(`/admin/orders/${row.id}`) })}
              locale={{
                emptyText: (
                  <EmptyState
                    icon={<ShoppingCart size={32} strokeWidth={1.5} />}
                    title="No orders yet"
                    description="Orders will show up here once customers start buying."
                  />
                ),
              }}
            />
          </Card>
        </div>

        <Card size="small" className="!shadow-card" styles={{ body: { padding: 0 } }}>
          <div className="aspect-[16/9] bg-app-bg relative overflow-hidden rounded-t-[14px] border-b border-app-border">
            {/* A stylized storefront thumbnail — a real screenshot would need
                a headless renderer; this conveys "your live site" honestly. */}
            <div className="absolute inset-4 rounded-md bg-app-surface shadow-card overflow-hidden">
              <div className="h-5 border-b border-app-border flex items-center gap-1 px-2">
                <span className="w-1.5 h-1.5 rounded-full bg-ink-subtle/50" />
                <span className="w-1.5 h-1.5 rounded-full bg-ink-subtle/50" />
                <span className="w-1.5 h-1.5 rounded-full bg-ink-subtle/50" />
              </div>
              <div className="h-[46%] bg-brand-gradient opacity-80" />
              <div className="grid grid-cols-3 gap-1.5 p-2">
                <div className="h-6 rounded-sm bg-app-bg" />
                <div className="h-6 rounded-sm bg-app-bg" />
                <div className="h-6 rounded-sm bg-app-bg" />
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-ink m-0">Online store</h2>
              {storeStatus.themeActive ? <StatusBadge status="live" /> : <StatusBadge status="draft" />}
            </div>
            <a
              href={storefrontUrlFor(store)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-ink-muted hover:text-ink inline-flex items-center gap-1 mt-1 break-all"
            >
              {storefrontLabelFor(store)} <ExternalLink size={12} className="shrink-0" aria-hidden="true" />
            </a>
            <div className="flex items-center gap-2 mt-4 text-[13px] text-ink">
              <Palette size={14} className="text-ink-muted" aria-hidden="true" />
              Theme: <span className="font-medium">{storeStatus.themeName || "None installed"}</span>
            </div>
            <div className="flex gap-2 mt-4">
              <Link href="/admin/online-store/themes" className="flex-1">
                <Button block>Customize</Button>
              </Link>
              <Button href={storefrontUrlFor(store)} target="_blank" rel="noopener noreferrer" className="flex-1" type="primary">
                View store
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
