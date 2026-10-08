"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Button } from "antd";
import { Plus, Navigation as NavigationIcon } from "lucide-react";
import { PageHeader, EmptyState, ListCard, DeleteIconButton, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

export default function ContentNavigationPage() {
  const router = useRouter();
  const { confirmDialog } = useConfirmDialog();
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/menus");
      setMenus(data.menus);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete(menu) {
    confirmDialog({
      title: `Delete "${menu.title}"?`,
      description: "Any part of your theme using this menu will show no links until you pick another.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/menus/${menu.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  const columns = [
    {
      title: "Menu",
      dataIndex: "title",
      render: (t, row) => (
        <div className="min-w-0">
          <Link
            href={`/admin/content/navigation/${row.id}`}
            className="font-medium text-ink hover:underline block truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {t}
          </Link>
          <span className="text-xs text-ink-muted">
            {row.items.length === 0
              ? "No links yet"
              : row.items
                  .slice(0, 4)
                  .map((i) => i.label)
                  .join(", ") + (row.items.length > 4 ? `, +${row.items.length - 4} more` : "")}
          </span>
        </div>
      ),
    },
    {
      title: "Handle",
      responsive: ["sm"],
      dataIndex: "handle",
      width: 170,
      render: (h) => <code className="text-xs bg-app-bg rounded px-1.5 py-0.5">{h}</code>,
    },
    {
      title: "Shown in",
      responsive: ["md"],
      width: 220,
      // Where the live theme shows it (header, footer columns).
      render: (_, row) =>
        row.usedIn?.length ? (
          <span className="text-[13px] text-ink">{row.usedIn.join(", ")}</span>
        ) : (
          <span className="text-[13px] text-ink-muted">Not on your store yet</span>
        ),
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
        title="Navigation"
        subtitle="Make as many menus as you like — each can be a footer column (up to 8) or your header menu. Open a menu to choose where it shows."
        actions={
          <Link href="/admin/content/navigation/new">
            <Button type="primary" icon={<Plus size={15} aria-hidden="true" />}>
              Add menu
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
          dataSource={menus}
          rowClassName="oy-row-link"
          onRow={(row) => ({ onClick: () => router.push(`/admin/content/navigation/${row.id}`) })}
          pagination={false}
          locale={{
            emptyText: (
              <EmptyState
                icon={<NavigationIcon />}
                title="No menus yet"
                description='Create a menu with the handle "main-menu" for your header and "footer-menu" for your footer.'
                actionLabel="Add menu"
                onAction={() => router.push("/admin/content/navigation/new")}
              />
            ),
          }}
        />
      </ListCard>
    </div>
  );
}
