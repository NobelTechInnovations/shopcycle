"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "antd";
import {
  Home,
  ShoppingCart,
  Package,
  Layers,
  Users,
  FileText,
  File,
  Navigation as NavigationIcon,
  Folder,
  Store,
  Palette,
  Settings,
  Tag,
  BarChart3,
  Radio,
  Megaphone,
  FileBarChart,
  Grid3x3,
} from "lucide-react";

// Mirrors the full target IA (not just what's wired in Phase 1) so the shell
// never needs restructuring later — unwired routes render a consistent
// "coming soon" EmptyState instead of a 404.
const NAV_ITEMS = [
  { key: "/admin", icon: <Home size={16} aria-hidden="true" />, label: <Link href="/admin">Home</Link> },
  {
    key: "analytics-group",
    icon: <BarChart3 size={16} aria-hidden="true" />,
    label: "Analytics",
    children: [
      {
        key: "/admin/analytics/live",
        icon: <Radio size={14} aria-hidden="true" />,
        label: <Link href="/admin/analytics/live">Live view</Link>,
      },
      {
        key: "/admin/analytics",
        icon: <BarChart3 size={14} aria-hidden="true" />,
        label: <Link href="/admin/analytics">Overview</Link>,
      },
      {
        key: "/admin/analytics/campaigns",
        icon: <Megaphone size={14} aria-hidden="true" />,
        label: <Link href="/admin/analytics/campaigns">Campaigns</Link>,
      },
      {
        key: "/admin/analytics/reports",
        icon: <FileBarChart size={14} aria-hidden="true" />,
        label: <Link href="/admin/analytics/reports">Reports</Link>,
      },
    ],
  },
  {
    key: "/admin/orders",
    icon: <ShoppingCart size={16} aria-hidden="true" />,
    label: <Link href="/admin/orders">Orders</Link>,
  },
  {
    key: "/admin/products",
    icon: <Package size={16} aria-hidden="true" />,
    label: <Link href="/admin/products">Products</Link>,
  },
  {
    key: "/admin/collections",
    icon: <Layers size={16} aria-hidden="true" />,
    label: <Link href="/admin/collections">Collections</Link>,
  },
  {
    key: "/admin/customers",
    icon: <Users size={16} aria-hidden="true" />,
    label: <Link href="/admin/customers">Customers</Link>,
  },
  {
    key: "/admin/discounts",
    icon: <Tag size={16} aria-hidden="true" />,
    label: <Link href="/admin/discounts">Discounts</Link>,
  },
  {
    key: "content-group",
    icon: <FileText size={16} aria-hidden="true" />,
    label: "Content",
    children: [
      {
        key: "/admin/content/pages",
        icon: <File size={14} aria-hidden="true" />,
        label: <Link href="/admin/content/pages">Pages</Link>,
      },
      {
        key: "/admin/content/navigation",
        icon: <NavigationIcon size={14} aria-hidden="true" />,
        label: <Link href="/admin/content/navigation">Navigation</Link>,
      },
      {
        key: "/admin/content/files",
        icon: <Folder size={14} aria-hidden="true" />,
        label: <Link href="/admin/content/files">Files</Link>,
      },
    ],
  },
  {
    key: "online-store-group",
    icon: <Store size={16} aria-hidden="true" />,
    label: "Online Store",
    children: [
      {
        key: "/admin/online-store/themes",
        icon: <Palette size={14} aria-hidden="true" />,
        label: <Link href="/admin/online-store/themes">Themes</Link>,
      },
    ],
  },
  {
    key: "/admin/apps",
    icon: <Grid3x3 size={16} aria-hidden="true" />,
    label: <Link href="/admin/apps">Apps</Link>,
  },
  {
    key: "/admin/settings",
    icon: <Settings size={16} aria-hidden="true" />,
    label: <Link href="/admin/settings">Settings</Link>,
  },
];

function flatten(items) {
  return items.flatMap((item) => (item.children ? flatten(item.children) : [item.key]));
}

function selectedKeyFor(pathname) {
  const keys = flatten(NAV_ITEMS).filter((key) => key.startsWith("/"));
  const matches = keys.filter((key) => pathname === key || pathname.startsWith(`${key}/`));
  matches.sort((a, b) => b.length - a.length);
  return matches[0] ? [matches[0]] : [];
}

export function Sidebar() {
  const pathname = usePathname();
  const openKeys = [];
  if (pathname.startsWith("/admin/content")) openKeys.push("content-group");
  if (pathname.startsWith("/admin/online-store")) openKeys.push("online-store-group");
  if (pathname.startsWith("/admin/analytics")) openKeys.push("analytics-group");

  return (
    <aside className="w-60 shrink-0 border-r border-app-border bg-app-surface h-screen sticky top-0 overflow-y-auto">
      <div className="h-14 flex items-center px-4 border-b border-app-border">
        <span className="font-semibold text-ink">ShopCycle</span>
      </div>
      <Menu
        mode="inline"
        items={NAV_ITEMS}
        selectedKeys={selectedKeyFor(pathname)}
        defaultOpenKeys={openKeys}
        style={{ border: "none", paddingTop: 8 }}
      />
    </aside>
  );
}
