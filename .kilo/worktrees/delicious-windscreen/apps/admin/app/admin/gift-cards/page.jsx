"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Button, Segmented } from "antd";
import { Plus, Gift } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState, ListCard, SearchInput } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";
import { IssueGiftCardModal } from "./IssueGiftCardModal";
import { cardState, CARD_STATE_BADGE, dateLabel } from "./gift-card-state";

export default function GiftCardsPage() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [issuing, setIssuing] = useState(false);
  const pageSize = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status, ...(q && { q }) });
      const data = await apiFetch(`/api/gift-cards?${params}`);
      setRows(data.giftCards);
      setTotal(data.total);
      setOutstanding(data.outstanding);
    } finally {
      setLoading(false);
    }
  }, [page, status, q]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      title: "Code",
      render: (_, row) => (
        <Link href={`/admin/gift-cards/${row.id}`} className="font-medium text-ink hover:underline tabular-nums tracking-wider whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          •••• {row.last4}
        </Link>
      ),
    },
    {
      title: "Status",
      width: 130,
      render: (_, row) => {
        const badge = CARD_STATE_BADGE[cardState(row)];
        return <StatusBadge status={badge.status} label={badge.label} />;
      },
    },
    {
      title: "Recipient",
      responsive: ["md"],
      render: (_, row) =>
        row.recipientName || row.recipientEmail ? (
          <div className="min-w-0">
            <span className="block text-sm text-ink truncate max-w-[220px]">{row.recipientName || row.recipientEmail}</span>
            {row.recipientName && row.recipientEmail && <span className="text-xs text-ink-muted">{row.recipientEmail}</span>}
          </div>
        ) : (
          <span className="text-ink-subtle">—</span>
        ),
    },
    {
      title: "Balance",
      align: "right",
      render: (_, row) => (
        <span className="tabular-nums">
          <span className="font-medium text-ink">{formatCurrency(row.balance, row.currency)}</span>
          <span className="text-xs text-ink-muted"> / {formatCurrency(row.initialValue, row.currency)}</span>
        </span>
      ),
    },
    {
      title: "Expires",
      responsive: ["sm"],
      width: 130,
      render: (_, row) => <span className="text-[13px] text-ink-muted tabular-nums">{row.expiresAt ? dateLabel(row.expiresAt) : "Never"}</span>,
    },
    {
      title: "Issued",
      responsive: ["lg"],
      width: 130,
      render: (_, row) => <span className="text-[13px] text-ink-muted tabular-nums">{dateLabel(row.createdAt)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Gift cards"
        subtitle={loading ? " " : `${total} ${total === 1 ? "card" : "cards"} · ${formatCurrency(outstanding, "INR")} unspent on active cards`}
        actions={
          <Button type="primary" icon={<Plus size={15} aria-hidden="true" />} onClick={() => setIssuing(true)}>
            Issue gift card
          </Button>
        }
      />

      <ListCard>
        <div className="flex flex-wrap items-center gap-3 p-3 border-b border-app-border">
          <Segmented
            size="small"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "disabled", label: "Disabled" },
            ]}
          />
          <SearchInput
            placeholder="Last 4 characters, name or email"
            className="!w-72"
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
          />
        </div>
        <Table
          rowKey="id"
          scroll={{ x: "max-content" }}
          loading={loading}
          columns={columns}
          dataSource={rows}
          rowClassName="oy-row-link"
          onRow={(row) => ({ onClick: () => router.push(`/admin/gift-cards/${row.id}`) })}
          pagination={total > pageSize && { current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<Gift />}
                title={q || status !== "all" ? "No gift cards match" : "No gift cards yet"}
                description="Issue gift cards as store credit, for giveaways, or as a goodwill gesture. Shoppers redeem them at checkout."
                actionLabel="Issue gift card"
                onAction={() => setIssuing(true)}
              />
            ),
          }}
        />
      </ListCard>

      <IssueGiftCardModal open={issuing} onClose={() => setIssuing(false)} onIssued={load} />
    </div>
  );
}
