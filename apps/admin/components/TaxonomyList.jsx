"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Button } from "antd";
import { Plus, Search } from "lucide-react";
import { PageHeader, EmptyState, ListCard, Thumb, SearchInput, DeleteIconButton, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

/**
 * One list page for any simple product taxonomy — Brands and Categories
 * today. They share an API shape (/api/{resource} → { [resource], total },
 * each row with title/slug/image/_count.products), so the page is written
 * once and configured per resource instead of copied.
 */
export function TaxonomyList({ resource, singular, plural, basePath, icon: Icon, description, hint }) {
  const router = useRouter();
  const { confirmDialog } = useConfirmDialog();
  const [rows, setRows] = useState([]);
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
      const data = await apiFetch(`/api/${resource}?${params.toString()}`);
      setRows(data[resource]);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [resource, q, page]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete(row) {
    const count = row._count?.products || 0;
    confirmDialog({
      title: `Delete "${row.title}"?`,
      description:
        count > 0
          ? `${count} ${count === 1 ? "product uses" : "products use"} this ${singular.toLowerCase()}. They won't be deleted, just unlinked.`
          : "This can't be undone.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/${resource}/${row.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  const columns = [
    {
      title: singular,
      dataIndex: "title",
      render: (title, row) => (
        <div className="flex items-center gap-3 min-w-0">
          <Thumb src={row.image} icon={<Icon size={16} strokeWidth={1.75} aria-hidden="true" />} />
          <div className="min-w-0">
            <Link
              href={`${basePath}/${row.id}`}
              className="font-medium text-ink hover:underline block truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {title}
            </Link>
            <span className="text-xs text-ink-muted font-mono">{row.slug}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Products",
      responsive: ["sm"],
      width: 120,
      align: "right",
      render: (_, row) => <span className="tabular-nums">{row._count?.products ?? 0}</span>,
    },
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
        title={plural}
        subtitle={loading ? " " : `${total} ${total === 1 ? singular.toLowerCase() : plural.toLowerCase()}${q ? " match" : ""}${hint ? ` · ${hint}` : ""}`}
        actions={
          <Link href={`${basePath}/new`}>
            <Button type="primary" icon={<Plus size={15} aria-hidden="true" />}>
              Add {singular.toLowerCase()}
            </Button>
          </Link>
        }
      />

      <ListCard
        toolbar={
          <SearchInput
            placeholder={`Search ${plural.toLowerCase()}`}
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
          dataSource={rows}
          rowClassName="oy-row-link"
          onRow={(row) => ({ onClick: () => router.push(`${basePath}/${row.id}`) })}
          pagination={total > pageSize && { current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: q ? (
              <EmptyState icon={<Search />} title={`No ${plural.toLowerCase()} match`} description="Try a different search." />
            ) : (
              <EmptyState
                icon={<Icon />}
                title={`No ${plural.toLowerCase()} yet`}
                description={description}
                actionLabel={`Add ${singular.toLowerCase()}`}
                onAction={() => router.push(`${basePath}/new`)}
              />
            ),
          }}
        />
      </ListCard>
    </div>
  );
}
