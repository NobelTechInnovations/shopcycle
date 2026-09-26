"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Button } from "antd";
import { Plus, Layers, Search } from "lucide-react";
import {
  PageHeader,
  StatusBadge,
  EmptyState,
  ListCard,
  Thumb,
  SearchInput,
  DeleteIconButton,
  useConfirmDialog,
} from "@shopcycle/ui";
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
      render: (title, row) => (
        <div className="flex items-center gap-3 min-w-0">
          <Thumb src={row.image} icon={<Layers size={16} strokeWidth={1.75} aria-hidden="true" />} />
          <div className="min-w-0">
            <Link
              href={`/admin/collections/${row.id}`}
              className="font-medium text-ink hover:underline block truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {title}
            </Link>
            <span className="text-xs text-ink-muted font-mono">/collections/{row.slug}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Products",
      responsive: ["sm"],
      width: 120,
      align: "right",
      render: (_, row) => <span className="tabular-nums">{row.products.length}</span>,
    },
    { title: "Status", dataIndex: "status", width: 130, render: (s) => <StatusBadge status={s} /> },
    {
      title: "",
      width: 56,
      align: "right",
      render: (_, row) => <DeleteIconButton label={`Delete ${row.title}`} onClick={() => handleDelete(row)} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Collections"
        subtitle={
          loading ? " " : `${total} ${total === 1 ? "collection" : "collections"}${q ? " match" : ""} · group products for menus and category pages`
        }
        actions={
          <Link href="/admin/collections/new">
            <Button type="primary" icon={<Plus size={15} aria-hidden="true" />}>
              Create collection
            </Button>
          </Link>
        }
      />

      <ListCard
        toolbar={
          <SearchInput
            placeholder="Search collections"
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
          dataSource={collections}
          rowClassName="oy-row-link"
          onRow={(row) => ({ onClick: () => router.push(`/admin/collections/${row.id}`) })}
          pagination={total > pageSize && { current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: q ? (
              <EmptyState icon={<Search />} title="No collections match" description="Try a different search." />
            ) : (
              <EmptyState
                icon={<Layers />}
                title="No collections yet"
                description="Group products together — they power your storefront's menu, homepage sections, and category pages."
                actionLabel="Create collection"
                onAction={() => router.push("/admin/collections/new")}
              />
            ),
          }}
        />
      </ListCard>
    </div>
  );
}
