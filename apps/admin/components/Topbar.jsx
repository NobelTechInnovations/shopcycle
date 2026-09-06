"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Dropdown, Avatar, Modal, Form, App } from "antd";
import { Search, LogOut, User as UserIcon, Store, Plus, ShieldCheck, Check } from "lucide-react";
import { apiFetch } from "@/lib/api";

export function Topbar({ user, store }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [stores, setStores] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    apiFetch("/api/auth/my-stores")
      .then((data) => setStores(data.stores))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function handleSwitch(storeId) {
    if (storeId === store?.id) return;
    try {
      await apiFetch("/api/auth/switch-store", { method: "POST", body: { storeId } });
      // A store switch changes everything the app has cached server-side
      // (products, orders, theme, ...) — a full navigation is the honest
      // way to reload all of it, not just this one client component.
      window.location.href = "/admin";
    } catch (err) {
      message.error(err.message);
    }
  }

  async function handleCreateStore(values) {
    try {
      await apiFetch("/api/auth/stores", { method: "POST", body: { storeName: values.storeName } });
      window.location.href = "/admin";
    } catch (err) {
      message.error(err.message);
    }
  }

  const storeMenuItems = [
    ...stores.map((s) => ({
      key: s.id,
      label: s.name,
      icon: s.id === store?.id ? <Check size={14} aria-hidden="true" /> : <Store size={14} aria-hidden="true" />,
      onClick: () => handleSwitch(s.id),
    })),
    { type: "divider" },
    {
      key: "create",
      label: "Create new store",
      icon: <Plus size={14} aria-hidden="true" />,
      onClick: () => setCreateOpen(true),
    },
  ];

  const accountMenuItems = [
    ...(user?.isSuperAdmin
      ? [{ key: "super-admin", label: "Super admin", icon: <ShieldCheck size={14} aria-hidden="true" />, onClick: () => router.push("/super-admin") }]
      : []),
    { key: "logout", label: "Log out", icon: <LogOut size={14} aria-hidden="true" />, onClick: handleLogout },
  ];

  return (
    <header className="h-14 border-b border-app-border bg-app-surface flex items-center justify-between px-4 sticky top-0 z-10">
      <div className="flex items-center gap-2 flex-1 max-w-md text-ink-muted">
        <Search size={16} aria-hidden="true" />
        <Input variant="borderless" placeholder="Search" aria-label="Search" />
      </div>
      <div className="flex items-center gap-3">
        {store && (
          <Dropdown menu={{ items: storeMenuItems }} placement="bottomRight" trigger={["click"]}>
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm text-ink-muted cursor-pointer hover:text-ink"
            >
              <Store size={14} aria-hidden="true" />
              <span className="hidden sm:inline">{store.name}</span>
            </button>
          </Dropdown>
        )}
        <Dropdown menu={{ items: accountMenuItems }} placement="bottomRight" trigger={["click"]}>
          <button
            type="button"
            className="flex items-center gap-2 cursor-pointer rounded-full"
            aria-label={`Account menu for ${user?.name || "account"}`}
          >
            <Avatar size={28} icon={<UserIcon size={14} aria-hidden="true" />} />
          </button>
        </Dropdown>
      </div>

      <Modal
        title="Create new store"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        okText="Create store"
        destroyOnHidden
      >
        <Form layout="vertical" form={form} onFinish={handleCreateStore} requiredMark={false}>
          <Form.Item name="storeName" label="Store name" rules={[{ required: true, min: 2, message: "Too short" }]}>
            <Input placeholder="My New Shop" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </header>
  );
}
