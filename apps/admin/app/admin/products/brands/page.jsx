"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Input, Button } from "antd";
import { Plus, Trash2, Tag } from "lucide-react";
import { PageHeader, EmptyState, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

export default function BrandsPage() {
  const router = useRouter();
  const { confirmDialog } = useConfirmDialog();
  const [brands, setBrands] = useState([]);
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
      const data = await apiFetch(`/api/brands?${params.toString()}`);
      setBrands(data.brands);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete(brand) {
    confirmDialog({
      title: `Delete "${brand.title}"?`,
      description: "Products using this brand won't be deleted, just unlinked.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/brands/${brand.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  const columns = [
    {
      title: "Brand",
      dataIndex: "title",
      render: (title, row) => <Link href={`/admin/products/brands/${row.id}`}>{title}</Link>,
    },
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
        title="Brands"
        actions={
          <Link href="/admin/products/brands/new">
            <Button type="primary" icon={<Plus size={14} aria-hidden="true" />}>
              Add brand
            </Button>
          </Link>
        }
      />

      <div className="mb-4">
        <Input.Search
          placeholder="Search brands"
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
          dataSource={brands}
          pagination={{ current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<Tag size={32} strokeWidth={1.5} />}
                title="No brands yet"
                description="Add brands so you can assign them to products."
                actionLabel="Add brand"
                onAction={() => router.push("/admin/products/brands/new")}
              />
            ),
          }}
        />
      </div>
    </div>
  );
}
