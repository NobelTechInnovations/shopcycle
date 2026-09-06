"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Button } from "antd";
import { Plus, Trash2, Navigation as NavigationIcon } from "lucide-react";
import { PageHeader, EmptyState, useConfirmDialog } from "@shopcycle/ui";
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
      description: "Any theme section pointing at this menu's handle will just show no links.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/menus/${menu.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  const columns = [
    { title: "Menu", dataIndex: "title", render: (t, row) => <Link href={`/admin/content/navigation/${row.id}`}>{t}</Link> },
    { title: "Handle", dataIndex: "handle", render: (h) => <code className="text-xs">{h}</code> },
    { title: "Items", render: (_, row) => row.items.length },
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
        title="Navigation"
        actions={
          <Link href="/admin/content/navigation/new">
            <Button type="primary" icon={<Plus size={14} aria-hidden="true" />}>
              Add menu
            </Button>
          </Link>
        }
      />

      <div className="bg-app-surface border border-app-border rounded-md">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={menus}
          pagination={false}
          locale={{
            emptyText: (
              <EmptyState
                icon={<NavigationIcon size={32} strokeWidth={1.5} />}
                title="No menus yet"
                description={'Themes reference a menu by "handle" — e.g. main-menu for the header, footer-menu for the footer.'}
                actionLabel="Add menu"
                onAction={() => router.push("/admin/content/navigation/new")}
              />
            ),
          }}
        />
      </div>
    </div>
  );
}
