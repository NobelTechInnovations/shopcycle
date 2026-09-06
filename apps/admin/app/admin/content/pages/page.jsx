"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Button } from "antd";
import { Plus, Trash2, File } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

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
      description: "This can't be undone.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/pages/${p.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  const columns = [
    { title: "Title", dataIndex: "title", render: (t, row) => <Link href={`/admin/content/pages/${row.id}`}>{t}</Link> },
    { title: "Status", dataIndex: "status", render: (s) => <StatusBadge status={s} /> },
    { title: "Updated", dataIndex: "updatedAt", render: (d) => new Date(d).toLocaleDateString() },
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
        title="Pages"
        actions={
          <Link href="/admin/content/pages/new">
            <Button type="primary" icon={<Plus size={14} aria-hidden="true" />}>
              Add page
            </Button>
          </Link>
        }
      />

      <div className="bg-app-surface border border-app-border rounded-md">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={pages}
          pagination={{ current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<File size={32} strokeWidth={1.5} />}
                title="No pages yet"
                description="Create pages like About, FAQ, or Contact for your storefront."
                actionLabel="Add page"
                onAction={() => router.push("/admin/content/pages/new")}
              />
            ),
          }}
        />
      </div>
    </div>
  );
}
