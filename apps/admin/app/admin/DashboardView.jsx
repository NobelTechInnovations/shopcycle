"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Table, Button } from "antd";
import {
  ShoppingCart,
  IndianRupee,
  Package,
  Users,
  Check,
  ArrowRight,
  ExternalLink,
  Palette,
  Layers,
  Truck,
  CreditCard,
  Globe,
} from "lucide-react";
import { StatusBadge, EmptyState } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { storefrontUrlFor, storefrontLabelFor } from "@/lib/storefront";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";

const columns = [
  { title: "Order", dataIndex: "orderNumber", render: (n) => <span className="font-medium">#{n}</span> },
  { title: "Customer", render: (_, row) => row.customer?.name || "—" },
  { title: "Total", dataIndex: "total", render: (value) => formatCurrency(value) },
  { title: "Payment", dataIndex: "paymentStatus", render: (status) => <StatusBadge status={status} /> },
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
    title: "Choose a plan",
    text: "Your first month is free on any plan — you won't be charged until it ends.",
    cta: "See plans",
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

function greetingFor(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function StatCard({ icon: Icon, label, value, href }) {
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px] text-ink-muted m-0">{label}</p>
        <p className="text-[26px] leading-tight font-semibold text-ink mt-1.5 mb-0 tabular-nums" style={{ letterSpacing: "-0.02em" }}>
          {value}
        </p>
      </div>
      <span className="w-9 h-9 rounded-md bg-app-bg text-ink-muted flex items-center justify-center shrink-0">
        <Icon size={17} aria-hidden="true" />
      </span>
    </div>
  );
  return (
    <Card size="small" className="!shadow-card hover:!shadow-raised transition-shadow" styles={{ body: { padding: 18 } }}>
      {href ? (
        <Link href={href} className="block text-inherit no-underline">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
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
  const { stats, recentOrders, storeStatus, setup, store, greetingName } = data;
  // The greeting depends on the viewer's own clock — computed after mount
  // so server-rendered HTML (server's timezone) never disagrees with the
  // client and trips a hydration mismatch.
  const [greeting, setGreeting] = useState("Welcome back");
  useEffect(() => setGreeting(greetingFor(new Date().getHours())), []);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-ink m-0" style={{ letterSpacing: "-0.02em" }}>
            {greeting}
            {greetingName ? `, ${greetingName}` : ""}
          </h1>
          <p className="text-sm text-ink-muted mt-1 mb-0">Here&apos;s what&apos;s happening with {store?.name || "your store"}.</p>
        </div>
      </div>

      {user && !user.emailVerified && <VerifyEmailBanner email={user.email} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard icon={IndianRupee} label="Total sales" value={formatCurrency(stats.sales)} href="/admin/analytics" />
        <StatCard icon={ShoppingCart} label="Orders" value={stats.orders} href="/admin/orders" />
        <StatCard icon={Package} label="Products" value={stats.products} href="/admin/products" />
        <StatCard icon={Users} label="Customers" value={stats.customers ?? 0} href="/admin/customers" />
      </div>

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
          >
            <Table
              rowKey="id"
              columns={columns}
              dataSource={recentOrders}
              pagination={false}
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
