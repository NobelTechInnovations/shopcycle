"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Input, Select, Button } from "antd";
import { Plus, Trash2, Package } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState, useConfirmDialog } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";

export default function ProductsPage() {
  const router = useRouter();
  const { confirmDialog } = useConfirmDialog();

  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(undefined);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      const data = await apiFetch(`/api/products?${params.toString()}`);
      setProducts(data.products);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [q, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete(product) {
    confirmDialog({
      title: `Delete "${product.title}"?`,
      description: "This can't be undone.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/products/${product.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  const columns = [
    {
      title: "Product",
      dataIndex: "title",
      render: (title, row) => <Link href={`/admin/products/${row.id}`}>{title}</Link>,
    },
    { title: "Status", dataIndex: "status", render: (s) => <StatusBadge status={s} /> },
    {
      title: "Inventory",
      render: (_, row) => row.variants.reduce((sum, v) => sum + v.inventoryQuantity, 0),
    },
    {
      title: "Price",
      render: (_, row) => (row.variants[0] ? formatCurrency(row.variants[0].price) : "—"),
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
        title="Products"
        actions={
          <Link href="/admin/products/new">
            <Button type="primary" icon={<Plus size={14} aria-hidden="true" />}>
              Add product
            </Button>
          </Link>
        }
      />

      <div className="flex gap-2 mb-4">
        <Input.Search
          placeholder="Search products"
          allowClear
          onSearch={(v) => {
            setPage(1);
            setQ(v);
          }}
          className="max-w-xs"
        />
        <Select
          placeholder="All statuses"
          allowClear
          className="w-40"
          options={[
            { value: "active", label: "Active" },
            { value: "draft", label: "Draft" },
            { value: "archived", label: "Archived" },
          ]}
          onChange={(v) => {
            setPage(1);
            setStatus(v);
          }}
        />
      </div>

      <div className="bg-app-surface border border-app-border rounded-md">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={products}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: setPage,
            showSizeChanger: false,
          }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<Package size={32} strokeWidth={1.5} />}
                title="No products yet"
                description="Add your first product to start building your catalog."
                actionLabel="Add product"
                onAction={() => router.push("/admin/products/new")}
              />
            ),
          }}
        />
      </div>
    </div>
  );
}
