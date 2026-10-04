"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Button, Segmented } from "antd";
import { Plus, Newspaper } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState, ListCard, SearchInput, DeleteIconButton, Thumb, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

function postState(row) {
  if (row.status !== "published") return "draft";
  return row.publishedAt && new Date(row.publishedAt) > new Date() ? "scheduled" : "published";
}

export default function BlogPostsPage() {
  const router = useRouter();
  const { confirmDialog } = useConfirmDialog();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status, ...(q && { q }) });
      const data = await apiFetch(`/api/blog?${params}`);
      setRows(data.articles);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [page, status, q]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete(row) {
    confirmDialog({
      title: `Delete "${row.title}"?`,
      description: "The post comes off your blog and its link stops working. This can't be undone.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/blog/${row.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  const columns = [
    {
      title: "Post",
      dataIndex: "title",
      render: (t, row) => (
        <div className="flex items-center gap-3 min-w-0">
          <Thumb src={row.image} alt="" size={44} />
          <div className="min-w-0">
            <Link href={`/admin/content/blog/${row.id}`} className="font-medium text-ink hover:underline block truncate max-w-[420px]" onClick={(e) => e.stopPropagation()}>
              {t}
            </Link>
            <span className="text-xs text-ink-muted">{[row.author, row.tags].filter(Boolean).join(" · ") || `/blog/${row.slug}`}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Status",
      width: 130,
      render: (_, row) => <StatusBadge status={postState(row)} />,
    },
    {
      title: "Published",
      responsive: ["sm"],
      width: 140,
      render: (_, row) => <span className="text-[13px] text-ink-muted tabular-nums">{row.status === "published" ? dateLabel(row.publishedAt) : "—"}</span>,
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
        title="Blog posts"
        subtitle={loading ? " " : `${total} ${total === 1 ? "post" : "posts"} · stories, guides and news on your store's journal`}
        actions={
          <Link href="/admin/content/blog/new">
            <Button type="primary" icon={<Plus size={15} aria-hidden="true" />}>
              Write post
            </Button>
          </Link>
        }
      />

      <ListCard>
        <div className="flex flex-wrap items-center gap-3 p-3 border-b border-app-border">
          <Segmented
            size="small"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All" },
              { value: "published", label: "Published" },
              { value: "draft", label: "Drafts" },
            ]}
          />
          <div className="flex-1 min-w-[200px]">
            <SearchInput
              placeholder="Search posts"
              onSearch={(v) => {
                setQ(v);
                setPage(1);
              }}
            />
          </div>
        </div>
        <Table
          rowKey="id"
          scroll={{ x: "max-content" }}
          loading={loading}
          columns={columns}
          dataSource={rows}
          rowClassName="oy-row-link"
          onRow={(row) => ({ onClick: () => router.push(`/admin/content/blog/${row.id}`) })}
          pagination={total > pageSize && { current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<Newspaper />}
                title={q || status !== "all" ? "No posts match" : "Start your journal"}
                description="Posts show up on your store's blog, in the home page's journal section, and in search results."
                actionLabel="Write post"
                onAction={() => router.push("/admin/content/blog/new")}
              />
            ),
          }}
        />
      </ListCard>
    </div>
  );
}
