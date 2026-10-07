"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Dropdown, Tooltip } from "antd";
import { BrandMark, AppIcon } from "@shopcycle/ui";
import { BrandGlyph } from "@/components/apps/AppTile";
import { APP_BRANDS } from "@/components/apps/brand-logos";
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
  Boxes,
  ShoppingBag,
  RotateCcw,
  Gift,
  Newspaper,
  SlidersHorizontal,
  LifeBuoy,
  MoreHorizontal,
  ChevronRight,
  Plus,
  ExternalLink,
  Settings2,
  Trash2,
  MessageSquare,
} from "lucide-react";
import { useApps, appHref, detailsHref } from "@/lib/apps";
import { apiFetch } from "@/lib/api";
import { useAppActions } from "./apps/useAppActions";

/** Customers ▸ Queries, with how many Contact page messages are unread.
 * The Queries page announces changes with "oy:queries-changed". */
function QueriesLink() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      apiFetch("/api/contact-messages/unread")
        .then((r) => alive && setCount(r.count || 0))
        .catch(() => {});
    load();
    const timer = setInterval(load, 120_000);
    window.addEventListener("oy:queries-changed", load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("oy:queries-changed", load);
    };
  }, []);
  return (
    <Link href="/admin/customers/queries" className="inline-flex items-center gap-2">
      Queries
      {count > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-ink text-white text-[11px] leading-[18px] text-center tabular-nums" aria-label={`${count} unread`}>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

// Mirrors the full target IA (not just what's wired in Phase 1) so the shell
// never needs restructuring later — unwired routes render a consistent
// "coming soon" EmptyState instead of a 404.
const NAV_ITEMS = [
  { key: "/admin", icon: <Home size={16} aria-hidden="true" />, label: <Link href="/admin">Home</Link> },
  {
    key: "orders-group",
    icon: <ShoppingCart size={16} aria-hidden="true" />,
    label: <Link href="/admin/orders">Orders</Link>,
    children: [
      { key: "/admin/orders", icon: <ShoppingCart size={14} aria-hidden="true" />, label: <Link href="/admin/orders">All orders</Link> },
      { key: "/admin/orders/returns", icon: <RotateCcw size={14} aria-hidden="true" />, label: <Link href="/admin/orders/returns">Returns</Link> },
      { key: "/admin/orders/abandoned", icon: <ShoppingBag size={14} aria-hidden="true" />, label: <Link href="/admin/orders/abandoned">Abandoned checkouts</Link> },
    ],
  },
  {
    key: "products-group",
    icon: <Package size={16} aria-hidden="true" />,
    label: <Link href="/admin/products">Products</Link>,
    children: [
      { key: "/admin/products", icon: <Package size={14} aria-hidden="true" />, label: <Link href="/admin/products">All products</Link> },
      { key: "/admin/products/inventory", icon: <Boxes size={14} aria-hidden="true" />, label: <Link href="/admin/products/inventory">Inventory</Link> },
      { key: "/admin/products/brands", icon: <Tag size={14} aria-hidden="true" />, label: <Link href="/admin/products/brands">Brands</Link> },
      { key: "/admin/products/categories", icon: <Grid3x3 size={14} aria-hidden="true" />, label: <Link href="/admin/products/categories">Categories</Link> },
      { key: "/admin/gift-cards", icon: <Gift size={14} aria-hidden="true" />, label: <Link href="/admin/gift-cards">Gift cards</Link> },
    ],
  },
  { key: "/admin/collections", icon: <Layers size={16} aria-hidden="true" />, label: <Link href="/admin/collections">Collections</Link> },
  {
    key: "customers-group",
    icon: <Users size={16} aria-hidden="true" />,
    label: <Link href="/admin/customers">Customers</Link>,
    children: [
      { key: "/admin/customers", icon: <Users size={14} aria-hidden="true" />, label: <Link href="/admin/customers">All customers</Link> },
      { key: "/admin/customers/queries", icon: <MessageSquare size={14} aria-hidden="true" />, label: <QueriesLink /> },
    ],
  },
  {
    key: "analytics-group",
    icon: <BarChart3 size={16} aria-hidden="true" />,
    label: "Analytics",
    children: [
      { key: "/admin/analytics", icon: <BarChart3 size={14} aria-hidden="true" />, label: <Link href="/admin/analytics">Overview</Link> },
      { key: "/admin/analytics/live", icon: <Radio size={14} aria-hidden="true" />, label: <Link href="/admin/analytics/live">Live view</Link> },
      { key: "/admin/analytics/campaigns", icon: <Megaphone size={14} aria-hidden="true" />, label: <Link href="/admin/analytics/campaigns">Campaigns</Link> },
      { key: "/admin/analytics/reports", icon: <FileBarChart size={14} aria-hidden="true" />, label: <Link href="/admin/analytics/reports">Reports</Link> },
    ],
  },
  { key: "/admin/discounts", icon: <Tag size={16} aria-hidden="true" />, label: <Link href="/admin/discounts">Discounts</Link> },
  {
    key: "content-group",
    icon: <FileText size={16} aria-hidden="true" />,
    label: "Content",
    children: [
      { key: "/admin/content/pages", icon: <File size={14} aria-hidden="true" />, label: <Link href="/admin/content/pages">Pages</Link> },
      { key: "/admin/content/blog", icon: <Newspaper size={14} aria-hidden="true" />, label: <Link href="/admin/content/blog">Blog posts</Link> },
      { key: "/admin/content/navigation", icon: <NavigationIcon size={14} aria-hidden="true" />, label: <Link href="/admin/content/navigation">Navigation</Link> },
      { key: "/admin/content/files", icon: <Folder size={14} aria-hidden="true" />, label: <Link href="/admin/content/files">Files</Link> },
    ],
  },
  {
    key: "online-store-group",
    icon: <Store size={16} aria-hidden="true" />,
    label: "Online Store",
    children: [
      { key: "/admin/online-store/themes", icon: <Palette size={14} aria-hidden="true" />, label: <Link href="/admin/online-store/themes">Themes</Link> },
      { key: "/admin/online-store/preferences", icon: <SlidersHorizontal size={14} aria-hidden="true" />, label: <Link href="/admin/online-store/preferences">Preferences</Link> },
    ],
  },
];

const BOTTOM_ITEMS = [
  { key: "/admin/settings", icon: <Settings size={16} aria-hidden="true" />, label: <Link href="/admin/settings">Settings</Link> },
  { key: "/admin/support", icon: <LifeBuoy size={16} aria-hidden="true" />, label: <Link href="/admin/support">Help & support</Link> },
];

function flatten(items) {
  return items.flatMap((item) => (item.children ? flatten(item.children) : [item.key]));
}

function selectedKeyFor(pathname, items) {
  const keys = flatten(items).filter((key) => key.startsWith("/"));
  // Home is only "/admin" itself — every page is under it.
  const matches = keys.filter((key) => pathname === key || (key !== "/admin" && pathname.startsWith(`${key}/`)));
  matches.sort((a, b) => b.length - a.length);
  return matches[0] ? [matches[0]] : [];
}

/** One installed app, pinned like Shopify's: click to open, ⋯ for its
 * settings or to uninstall. */
function PinnedApp({ app, active }) {
  const router = useRouter();
  const { uninstall } = useAppActions();
  const items = [
    { key: "open", icon: <ExternalLink size={14} aria-hidden="true" />, label: "Open app", onClick: () => router.push(appHref(app)) },
    { key: "settings", icon: <Settings2 size={14} aria-hidden="true" />, label: "App settings", onClick: () => router.push(detailsHref(app)) },
    { type: "divider" },
    { key: "uninstall", icon: <Trash2 size={14} aria-hidden="true" />, label: "Uninstall", danger: true, onClick: () => uninstall(app) },
  ];
  return (
    <li className="group relative">
      <Link
        href={appHref(app)}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 h-[34px] pl-3 pr-9 rounded-lg text-[14px] no-underline transition-colors ${
          active ? "bg-accent-soft text-ink font-medium" : "text-ink/85 hover:bg-[#F3F3F5] hover:text-ink"
        }`}
      >
        <span className={`w-[22px] h-[22px] shrink-0 rounded-[7px] flex items-center justify-center ${active ? "bg-white text-accent shadow-card" : "bg-app-bg text-ink-muted border border-app-border"}`}>
          {APP_BRANDS[app.key] ? <BrandGlyph app={app} size={13} /> : <AppIcon iconKey={app.iconKey} size={12} />}
        </span>
        <span className="truncate">{app.name}</span>
      </Link>
      <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
        <button
          type="button"
          aria-label={`${app.name} options`}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center bg-transparent border-0 cursor-pointer text-ink-muted hover:text-ink hover:bg-app-border/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 transition-opacity"
        >
          <MoreHorizontal size={15} aria-hidden="true" />
        </button>
      </Dropdown>
    </li>
  );
}

function PinnedApps({ pathname }) {
  const { installed, loading } = useApps();
  const onApps = pathname === "/admin/apps";
  return (
    <section aria-label="Installed apps" className="mt-4 px-2">
      <div className="flex items-center justify-between pl-3 pr-1 h-7 mb-0.5">
        <Link href="/admin/apps" className={`group/h inline-flex items-center gap-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] no-underline ${onApps ? "text-ink" : "text-ink-subtle hover:text-ink"}`}>
          Apps
          <ChevronRight size={13} aria-hidden="true" className="opacity-60 group-hover/h:translate-x-0.5 transition-transform" />
        </Link>
        <Tooltip title="Browse apps" placement="right">
          <Link href="/admin/apps" aria-label="Browse apps" className="w-6 h-6 rounded-md flex items-center justify-center text-ink-subtle hover:text-ink hover:bg-app-bg">
            <Plus size={14} aria-hidden="true" />
          </Link>
        </Tooltip>
      </div>
      <ul className="list-none m-0 p-0 flex flex-col gap-0.5">
        {installed.map((app) => (
          <PinnedApp key={app.key} app={app} active={pathname.startsWith(appHref(app)) || pathname.startsWith(detailsHref(app))} />
        ))}
        {loading &&
          [0, 1].map((i) => (
            <li key={i} className="h-[34px] px-3 flex items-center gap-2.5" aria-hidden="true">
              <span className="w-[22px] h-[22px] rounded-[7px] bg-app-bg" />
              <span className="h-2.5 w-24 rounded bg-app-bg" />
            </li>
          ))}
        {!loading && installed.length === 0 && (
          <li>
            <Link href="/admin/apps" className="flex items-center gap-2.5 h-[34px] px-3 rounded-lg text-[13px] text-ink-muted no-underline hover:bg-[#F3F3F5] hover:text-ink">
              <span className="w-[22px] h-[22px] rounded-[7px] border border-dashed border-app-border flex items-center justify-center">
                <Plus size={12} aria-hidden="true" />
              </span>
              Add apps to your store
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}

/** The navigation itself — brand, menu, pinned apps, settings and help.
 * Rendered in the fixed desktop sidebar and, below `lg`, inside the
 * slide-out drawer (see AdminShell). */
export function SidebarNav() {
  const pathname = usePathname();
  const openKeys = [];
  if (pathname.startsWith("/admin/content")) openKeys.push("content-group");
  if (pathname.startsWith("/admin/online-store")) openKeys.push("online-store-group");
  if (pathname.startsWith("/admin/analytics")) openKeys.push("analytics-group");
  if (pathname.startsWith("/admin/products") || pathname.startsWith("/admin/gift-cards")) openKeys.push("products-group");
  if (pathname.startsWith("/admin/orders")) openKeys.push("orders-group");
  if (pathname.startsWith("/admin/customers")) openKeys.push("customers-group");

  return (
    <div className="flex flex-col h-full min-h-0">
      <Link href="/admin" className="h-14 flex items-center px-5 shrink-0" aria-label="Oyklane admin home">
        <BrandMark size={24} label="Admin" />
      </Link>
      <div className="flex-1 min-h-0 overflow-y-auto pb-3">
        <Menu mode="inline" items={NAV_ITEMS} selectedKeys={selectedKeyFor(pathname, NAV_ITEMS)} defaultOpenKeys={openKeys} style={{ border: "none", paddingTop: 4, background: "transparent" }} />
        <PinnedApps pathname={pathname} />
      </div>
      <div className="shrink-0 border-t border-app-border pt-1.5 pb-2">
        <Menu mode="inline" items={BOTTOM_ITEMS} selectedKeys={selectedKeyFor(pathname, BOTTOM_ITEMS)} style={{ border: "none", background: "transparent" }} />
      </div>
    </div>
  );
}

/** Desktop sidebar — hidden below `lg`, where the drawer takes over. */
export function Sidebar() {
  return (
    <aside className="print:hidden hidden lg:flex w-60 shrink-0 border-r border-app-border bg-app-surface h-screen sticky top-0 flex-col">
      <SidebarNav />
    </aside>
  );
}
