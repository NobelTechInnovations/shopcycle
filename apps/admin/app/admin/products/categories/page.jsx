"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Input, Button } from "antd";
import { Plus, Trash2, Grid3x3 } from "lucide-react";
import { PageHeader, EmptyState, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

export default function CategoriesPage() {
  const router = useRouter();
  const { confirmDialog } = useConfirmDialog();
  const [categories, setCategories] = useState([]);
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
      const data = await apiFetch(`/api/categories?${params.toString()}`);
      setCategories(data.categories);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete(category) {
    confirmDialog({
      title: `Delete "${category.title}"?`,
      description: "Products using this category won't be deleted, just unlinked.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/categories/${category.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  const columns = [
    {
      title: "Category",
      dataIndex: "title",
      render: (title, row) => <Link href={`/admin/products/categories/${row.id}`}>{title}</Link>,
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
        title="Categories"
        actions={
          <Link href="/admin/products/categories/new">
            <Button type="primary" icon={<Plus size={14} aria-hidden="true" />}>
              Add category
            </Button>
          </Link>
        }
      />

      <div className="mb-4">
        <Input.Search
          placeholder="Search categories"
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
          dataSource={categories}
          pagination={{ current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<Grid3x3 size={32} strokeWidth={1.5} />}
                title="No categories yet"
                description="Add categories so you can assign them to products."
                actionLabel="Add category"
                onAction={() => router.push("/admin/products/categories/new")}
              />
            ),
          }}
        />
      </div>
    </div>
  );
}
