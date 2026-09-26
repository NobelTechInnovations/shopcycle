"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Table, Button, App } from "antd";
import { Store, CreditCard, Hourglass, AlertTriangle, Search } from "lucide-react";
import { PageHeader, StatusBadge, ListCard, SearchInput, EmptyState, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN || "localhost";

// subscriptionStatus → how it reads to an operator. Suspension (a manual
// platform action) is shown separately from billing state.
const BILLING = {
  no_plan: { status: "draft", label: "No plan yet" },
  trialing: { status: "scheduled", label: "Free trial" },
  active: { status: "paid", label: "Paying" },
  past_due: { status: "failed", label: "Payment failed" },
  cancelled: { status: "cancelled", label: "Cancelled" },
};

const TABS = [
  { key: "all", label: "All", match: () => true },
  { key: "paying", label: "Paying", match: (c) => c.subscriptionStatus === "active" },
  { key: "trial", label: "In trial", match: (c) => c.subscriptionStatus === "trialing" },
  { key: "no_plan", label: "No plan", match: (c) => c.subscriptionStatus === "no_plan" },
  { key: "at_risk", label: "Payment failed", match: (c) => c.subscriptionStatus === "past_due" },
  { key: "suspended", label: "Suspended", match: (c) => c.status === "suspended" },
];

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-[18px] flex items-start justify-between gap-3">
      <div>
        <p className="text-[13px] text-ink-muted m-0">{label}</p>
        <p className="text-[26px] leading-tight font-semibold text-ink mt-1.5 mb-0 tabular-nums" style={{ letterSpacing: "-0.02em" }}>
          {value}
        </p>
      </div>
      <span
        className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
        style={tone === "danger" ? { background: "#FDECEC", color: "#DC2626" } : { background: "#F7F7F8", color: "#6B6B76" }}
      >
        <Icon size={17} aria-hidden="true" />
      </span>
    </div>
  );
}

export default function CompaniesPage() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/super-admin/companies");
      setCompanies(data.companies);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, companies.filter(t.match).length])), [companies]);

  const visible = useMemo(() => {
    const matchTab = TABS.find((t) => t.key === tab).match;
    const needle = q.toLowerCase();
    return companies.filter(
      (c) =>
        matchTab(c) &&
        (!needle ||
          c.name.toLowerCase().includes(needle) ||
          c.handle.toLowerCase().includes(needle) ||
          (c.owner?.email || "").toLowerCase().includes(needle))
    );
  }, [companies, tab, q]);

  function toggleStatus(company) {
    const next = company.status === "active" ? "suspended" : "active";
    confirmDialog({
      title: `${next === "suspended" ? "Suspend" : "Reactivate"} ${company.name}?`,
      description:
        next === "suspended"
          ? "Their storefront goes offline and their admin is locked immediately. This is recorded in the audit log."
          : "This restores their storefront and admin access.",
      okText: next === "suspended" ? "Suspend store" : "Reactivate",
      danger: next === "suspended",
      onConfirm: async () => {
        try {
          await apiFetch(`/api/super-admin/companies/${company.id}/status`, { method: "PATCH", body: { status: next } });
          message.success(next === "suspended" ? `${company.name} suspended` : `${company.name} reactivated`);
          load();
        } catch (err) {
          message.error(err.message);
        }
      },
    });
  }

  const columns = [
    {
      title: "Store",
      dataIndex: "name",
      render: (name, row) => (
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-lg bg-brand-gradient text-white text-xs font-semibold flex items-center justify-center shrink-0">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <div className="font-medium text-ink truncate">{name}</div>
            <div className="text-xs text-ink-muted font-mono truncate">
              {row.domain || (ROOT_DOMAIN === "localhost" ? row.handle : `${row.handle}.${ROOT_DOMAIN}`)}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Owner",
      responsive: ["md"],
      render: (_, row) =>
        row.owner ? (
          <div className="min-w-0">
            <div className="text-ink truncate">{row.owner.name}</div>
            <div className="text-xs text-ink-muted truncate">{row.owner.email}</div>
          </div>
        ) : (
          "—"
        ),
    },
    {
      title: "Plan",
      width: 190,
      render: (_, row) => {
        const b = BILLING[row.subscriptionStatus] || BILLING.no_plan;
        return (
          <div className="flex flex-col items-start gap-1">
            <span className="text-ink text-[13px]">{row.plan?.name || "—"}</span>
            <StatusBadge status={b.status} label={b.label} />
          </div>
        );
      },
    },
    {
      title: "Products",
      responsive: ["lg"],
      dataIndex: "productCount",
      width: 90,
      align: "right",
      render: (n) => <span className="tabular-nums">{n}</span>,
    },
    {
      title: "Orders",
      responsive: ["lg"],
      dataIndex: "orderCount",
      width: 80,
      align: "right",
      render: (n) => <span className="tabular-nums">{n}</span>,
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 120,
      render: (status) => <StatusBadge status={status} />,
    },
    {
      title: "",
      width: 120,
      align: "right",
      render: (_, row) => (
        <Button size="small" danger={row.status === "active"} onClick={() => toggleStatus(row)}>
          {row.status === "active" ? "Suspend" : "Reactivate"}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Companies" subtitle="Every store on Oyklane, with its plan and billing health." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Stat icon={Store} label="Stores" value={loading ? "–" : companies.length} />
        <Stat icon={CreditCard} label="Paying" value={loading ? "–" : counts.paying} />
        <Stat icon={Hourglass} label="In free trial" value={loading ? "–" : counts.trial} />
        <Stat
          icon={AlertTriangle}
          label="Payment failed"
          value={loading ? "–" : counts.at_risk}
          tone={counts.at_risk > 0 ? "danger" : undefined}
        />
      </div>

      <ListCard
        tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: loading ? undefined : counts[t.key] }))}
        activeTab={tab}
        onTabChange={setTab}
        toolbar={<SearchInput placeholder="Store, handle, or owner email" onSearch={setQ} />}
      >
        <Table
          rowKey="id"
          scroll={{ x: "max-content" }}
          columns={columns}
          dataSource={visible}
          loading={loading}
          pagination={visible.length > 25 && { pageSize: 25, showSizeChanger: false }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<Search />}
                title={q || tab !== "all" ? "No stores match" : "No stores yet"}
                description={q || tab !== "all" ? "Try a different search or another tab." : "Stores appear here as merchants sign up."}
              />
            ),
          }}
        />
      </ListCard>
    </div>
  );
}
