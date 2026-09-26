"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Button } from "antd";
import { Plus, FileText } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState, ListCard, DeleteIconButton, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

function relativeTime(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function ContentPagesPage() {
  const router = useRouter();
  const { confirmDialog } = useConfirmDialog();
  const [pages, setPages] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/pages?page=${page}&pageSize=${pageSize}`);
      setPages(data.pages);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete(p) {
    confirmDialog({
      title: `Delete "${p.title}"?`,
      description: "Links to this page on your storefront will stop working. This can't be undone.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/pages/${p.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  const columns = [
    {
      title: "Page",
      dataIndex: "title",
      render: (t, row) => (
        <div className="min-w-0">
          <Link
            href={`/admin/content/pages/${row.id}`}
            className="font-medium text-ink hover:underline block truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {t}
          </Link>
          <span className="text-xs text-ink-muted font-mono">/pages/{row.slug}</span>
        </div>
      ),
    },
    { title: "Status", dataIndex: "status", width: 130, render: (s) => <StatusBadge status={s} /> },
    {
      title: "Last edited",
      responsive: ["sm"],
      dataIndex: "updatedAt",
      width: 150,
      render: (d) => <span className="text-[13px] text-ink-muted">{relativeTime(d)}</span>,
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
        title="Pages"
        subtitle={loading ? " " : `${total} ${total === 1 ? "page" : "pages"} · About, FAQ, policies, and other store pages`}
        actions={
          <Link href="/admin/content/pages/new">
            <Button type="primary" icon={<Plus size={15} aria-hidden="true" />}>
              Add page
            </Button>
          </Link>
        }
      />

      <ListCard>
        <Table
          rowKey="id"
          scroll={{ x: "max-content" }}
          loading={loading}
          columns={columns}
          dataSource={pages}
          rowClassName="oy-row-link"
          onRow={(row) => ({ onClick: () => router.push(`/admin/content/pages/${row.id}`) })}
          pagination={total > pageSize && { current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<FileText />}
                title="No pages yet"
                description="Create pages like About, FAQ, Shipping, or Returns for your storefront."
                actionLabel="Add page"
                onAction={() => router.push("/admin/content/pages/new")}
              />
            ),
          }}
        />
      </ListCard>
    </div>
  );
}
