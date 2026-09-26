"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Dropdown, Modal, Form, App, Button } from "antd";
import {
  Search,
  LogOut,
  Store,
  Plus,
  ShieldCheck,
  Check,
  ChevronsUpDown,
  ExternalLink,
  MonitorSmartphone,
  Menu,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { storefrontUrlFor, initials } from "@/lib/storefront";
import { CommandPalette } from "./CommandPalette";

export function Topbar({ user, store, onOpenNav }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [stores, setStores] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [form] = Form.useForm();

  // Cmd/Ctrl+K opens search from anywhere in the admin.
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  function handleLogoutEverywhere() {
    Modal.confirm({
      title: "Sign out of all devices?",
      content: "Every session on your account ends — on this browser, your phone, and anywhere else you're signed in.",
      okText: "Sign out everywhere",
      okButtonProps: { danger: true },
      onOk: async () => {
        await apiFetch("/api/auth/logout-everywhere", { method: "POST" });
        router.push("/login");
        router.refresh();
      },
    });
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
    {
      key: "who",
      disabled: true,
      label: (
        <div className="py-0.5">
          <div className="text-sm font-medium text-ink">{user?.name}</div>
          <div className="text-xs text-ink-muted">{user?.email}</div>
        </div>
      ),
    },
    { type: "divider" },
    ...(user?.isSuperAdmin
      ? [
          {
            key: "super-admin",
            label: "Super admin",
            icon: <ShieldCheck size={14} aria-hidden="true" />,
            // A separate app/domain now (adminshopcycle.com), not a route of
            // this app — a plain navigation, not router.push.
            onClick: () => window.location.assign(process.env.NEXT_PUBLIC_SUPER_ADMIN_URL || "http://localhost:3003"),
          },
        ]
      : []),
    { key: "logout", label: "Log out", icon: <LogOut size={14} aria-hidden="true" />, onClick: handleLogout },
    {
      key: "logout-all",
      label: "Sign out of all devices",
      icon: <MonitorSmartphone size={14} aria-hidden="true" />,
      onClick: handleLogoutEverywhere,
    },
  ];

  return (
    <header className="print:hidden h-14 border-b border-app-border bg-app-surface/85 backdrop-blur flex items-center justify-between gap-3 px-3 sm:px-6 sticky top-0 z-10">
      {onOpenNav && (
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open menu"
          className="lg:hidden w-10 h-10 -ml-1 rounded-md flex items-center justify-center text-ink bg-transparent border-0 cursor-pointer hover:bg-app-bg"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="hidden sm:flex items-center gap-2 flex-1 max-w-md h-9 px-3 rounded-md bg-app-bg border border-transparent text-ink-muted text-sm cursor-pointer hover:border-app-border transition-colors"
        aria-label="Search (Ctrl+K)"
      >
        <Search size={15} aria-hidden="true" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="inline-flex items-center h-5 px-1.5 rounded border border-app-border bg-app-surface text-[11px] font-sans text-ink-muted">⌘K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label="Search"
        className="sm:hidden w-10 h-10 rounded-md flex items-center justify-center text-ink bg-transparent border-0 cursor-pointer hover:bg-app-bg"
      >
        <Search size={18} aria-hidden="true" />
      </button>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <div className="flex items-center gap-2">
        {store && (
          <Button
            href={storefrontUrlFor(store)}
            target="_blank"
            rel="noopener noreferrer"
            icon={<ExternalLink size={14} aria-hidden="true" />}
            className="hidden md:inline-flex"
          >
            View store
          </Button>
        )}
        {store && (
          <Dropdown menu={{ items: storeMenuItems }} placement="bottomRight" trigger={["click"]}>
            <button
              type="button"
              className="flex items-center gap-2 h-9 pl-1.5 pr-2.5 rounded-md border border-app-border bg-app-surface text-sm text-ink cursor-pointer hover:bg-app-bg transition-colors"
              aria-label={`Current store: ${store.name}. Switch store`}
            >
              <span className="w-6 h-6 rounded-[7px] bg-brand-gradient text-white text-[11px] font-semibold flex items-center justify-center">
                {initials(store.name)}
              </span>
              <span className="hidden sm:inline max-w-[140px] truncate font-medium">{store.name}</span>
              <ChevronsUpDown size={14} className="text-ink-subtle" aria-hidden="true" />
            </button>
          </Dropdown>
        )}
        <Dropdown menu={{ items: accountMenuItems }} placement="bottomRight" trigger={["click"]}>
          <button
            type="button"
            className="w-9 h-9 rounded-full bg-ink text-white text-xs font-semibold flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
            aria-label={`Account menu for ${user?.name || "account"}`}
          >
            {initials(user?.name)}
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
