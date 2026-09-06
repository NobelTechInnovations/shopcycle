"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Input, Button } from "antd";
import { Plus, Trash2, Layers } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

export default function CollectionsPage() {
  const router = useRouter();
  const { confirmDialog } = useConfirmDialog();
  const [collections, setCollections] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q) params.set("q", q);
      const data = await apiFetch(`/api/collections?${params.toString()}`);
      setCollections(data.collections);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete(collection) {
    confirmDialog({
      title: `Delete "${collection.title}"?`,
      description: "Products in this collection won't be deleted, just unlinked.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/collections/${collection.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  const columns = [
    {
      title: "Collection",
      dataIndex: "title",
      render: (title, row) => <Link href={`/admin/collections/${row.id}`}>{title}</Link>,
    },
    { title: "Status", dataIndex: "status", render: (s) => <StatusBadge status={s} /> },
    { title: "Products", render: (_, row) => row.products.length },
    {
      title: "",
      width: 48,
      render: (_, row) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<Trash2 size={14} aria-hidden="true" />}
          aria-label={`Delete ${row.title}`}
          onClick={() => handleDelete(row)}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Collections"
        actions={
          <Link href="/admin/collections/new">
            <Button type="primary" icon={<Plus size={14} aria-hidden="true" />}>
              Create collection
            </Button>
          </Link>
        }
      />

      <div className="mb-4">
        <Input.Search
          placeholder="Search collections"
          allowClear
          className="max-w-xs"
          onSearch={(v) => {
            setPage(1);
            setQ(v);
          }}
        />
      </div>

      <div className="bg-app-surface border border-app-border rounded-md">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={collections}
          pagination={{ current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<Layers size={32} strokeWidth={1.5} />}
                title="No collections yet"
                description="Group products together to power your storefront's category pages."
                actionLabel="Create collection"
                onAction={() => router.push("/admin/collections/new")}
              />
            ),
          }}
        />
      </div>
    </div>
  );
}
