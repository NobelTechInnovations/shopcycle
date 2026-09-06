"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Button } from "antd";
import { Plus, Trash2, Tag as TagIcon } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

export default function DiscountsPage() {
  const router = useRouter();
  const { confirmDialog } = useConfirmDialog();
  const [discounts, setDiscounts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/discounts?page=${page}&pageSize=${pageSize}`);
      setDiscounts(data.discounts);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete(discount) {
    confirmDialog({
      title: `Delete "${discount.code}"?`,
      description: "This can't be undone.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/discounts/${discount.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  const columns = [
    { title: "Code", dataIndex: "code", render: (c, row) => <Link href={`/admin/discounts/${row.id}`}><code>{c}</code></Link> },
    {
      title: "Value",
      render: (_, row) => (row.type === "percentage" ? `${Number(row.value)}%` : `₹${Number(row.value).toFixed(2)}`),
    },
    { title: "Used", render: (_, row) => `${row.usageCount}${row.usageLimit ? ` / ${row.usageLimit}` : ""}` },
    { title: "Status", dataIndex: "status", render: (s) => <StatusBadge status={s} /> },
    {
      title: "",
      width: 48,
      render: (_, row) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<Trash2 size={14} aria-hidden="true" />}
          aria-label={`Delete ${row.code}`}
          onClick={() => handleDelete(row)}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Discounts"
        actions={
          <Link href="/admin/discounts/new">
            <Button type="primary" icon={<Plus size={14} aria-hidden="true" />}>
              Create discount
            </Button>
          </Link>
        }
      />

      <div className="bg-app-surface border border-app-border rounded-md">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={discounts}
          pagination={{ current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<TagIcon size={32} strokeWidth={1.5} />}
                title="No discounts yet"
                description="Create a discount code shoppers can enter at cart to get a percentage or fixed amount off."
                actionLabel="Create discount"
                onAction={() => router.push("/admin/discounts/new")}
              />
            ),
          }}
        />
      </div>
    </div>
  );
}
