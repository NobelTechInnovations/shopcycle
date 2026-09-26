"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Button } from "antd";
import { Plus, Package, Search } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState, ListCard, Thumb, SearchInput, DeleteIconButton, useConfirmDialog } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";

const TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "draft", label: "Draft" },
  { key: "archived", label: "Archived" },
];

const LOW_STOCK = 5;

function Inventory({ variants }) {
  const qty = variants.reduce((sum, v) => sum + v.inventoryQuantity, 0);
  const across = variants.length > 1 ? ` · ${variants.length} variants` : "";
  if (qty <= 0) return <span className="text-status-danger text-[13px]">Out of stock{across}</span>;
  if (qty <= LOW_STOCK) return <span className="text-status-warning text-[13px]">{qty} left{across}</span>;
  return (
    <span className="text-[13px] text-ink tabular-nums">
      {qty} in stock<span className="text-ink-muted">{across}</span>
    </span>
  );
}

function priceLabel(variants) {
  if (!variants.length) return "—";
  const prices = variants.map((v) => Number(v.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`;
}

export default function ProductsPage() {
  const router = useRouter();
  const { confirmDialog } = useConfirmDialog();

  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q) params.set("q", q);
      if (tab !== "all") params.set("status", tab);
      const data = await apiFetch(`/api/products?${params.toString()}`);
      setProducts(data.products);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [q, tab, page]);

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
      render: (title, row) => (
        <div className="flex items-center gap-3 min-w-0">
          <Thumb src={row.images?.[0]?.url} alt="" />
          <div className="min-w-0">
            <Link
              href={`/admin/products/${row.id}`}
              className="font-medium text-ink hover:underline block truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {title}
            </Link>
            {(row.productType || row.vendor) && (
              <span className="text-xs text-ink-muted truncate block">
                {[row.productType, row.vendor].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
        </div>
      ),
    },
    { title: "Status", dataIndex: "status", width: 120, render: (s) => <StatusBadge status={s} /> },
    { title: "Inventory", responsive: ["md"], width: 200, render: (_, row) => <Inventory variants={row.variants} /> },
    {
      title: "Price",
      width: 160,
      align: "right",
      render: (_, row) => <span className="tabular-nums">{priceLabel(row.variants)}</span>,
    },
    {
      title: "",
      width: 56,
      align: "right",
      render: (_, row) => <DeleteIconButton label={`Delete ${row.title}`} onClick={() => handleDelete(row)} />,
    },
  ];

  const filtered = Boolean(q) || tab !== "all";

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={loading ? " " : `${total} ${total === 1 ? "product" : "products"}${filtered ? " match" : ""}`}
        actions={
          <Link href="/admin/products/new">
            <Button type="primary" icon={<Plus size={15} aria-hidden="true" />}>
              Add product
            </Button>
          </Link>
        }
      />

      <ListCard
        tabs={TABS}
        activeTab={tab}
        onTabChange={(key) => {
          setPage(1);
          setTab(key);
        }}
        toolbar={
          <SearchInput
            placeholder="Search products"
            onSearch={(v) => {
              setPage(1);
              setQ(v);
            }}
          />
        }
      >
        <Table
          rowKey="id"
          scroll={{ x: "max-content" }}
          loading={loading}
          columns={columns}
          dataSource={products}
          rowClassName="oy-row-link"
          onRow={(row) => ({ onClick: () => router.push(`/admin/products/${row.id}`) })}
          pagination={
            total > pageSize && { current: page, pageSize, total, onChange: setPage, showSizeChanger: false }
          }
          locale={{
            emptyText: filtered ? (
              <EmptyState
                icon={<Search />}
                title="No products match"
                description="Try a different search or another tab."
              />
            ) : (
              <EmptyState
                icon={<Package />}
                title="Add your first product"
                description="Photos, a price, and a description are all a product needs to start selling."
                actionLabel="Add product"
                onAction={() => router.push("/admin/products/new")}
              />
            ),
          }}
        />
      </ListCard>
    </div>
  );
}
