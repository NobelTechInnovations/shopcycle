"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "antd";
import {
  Search,
  Package,
  ShoppingCart,
  User,
  Layers,
  Tag,
  File,
  Newspaper,
  Plus,
  Palette,
  Settings,
  Gift,
  BarChart3,
  CornerDownLeft,
  Loader2,
} from "lucide-react";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";

// Shown before typing, and matched by name while typing.
const ACTIONS = [
  { id: "a-product", label: "Add product", href: "/admin/products/new", icon: Plus, keywords: "new create product" },
  { id: "a-orders", label: "Orders", href: "/admin/orders", icon: ShoppingCart, keywords: "orders sales" },
  { id: "a-products", label: "Products", href: "/admin/products", icon: Package, keywords: "products catalogue inventory" },
  { id: "a-customers", label: "Customers", href: "/admin/customers", icon: User, keywords: "customers people" },
  { id: "a-discount", label: "Create discount", href: "/admin/discounts/new", icon: Tag, keywords: "new discount coupon code" },
  { id: "a-gift", label: "Gift cards", href: "/admin/gift-cards", icon: Gift, keywords: "gift card store credit" },
  { id: "a-blog", label: "Write blog post", href: "/admin/content/blog/new", icon: Newspaper, keywords: "blog post article journal" },
  { id: "a-themes", label: "Themes", href: "/admin/online-store/themes", icon: Palette, keywords: "theme design online store customize" },
  { id: "a-analytics", label: "Analytics", href: "/admin/analytics", icon: BarChart3, keywords: "analytics reports stats" },
  { id: "a-settings", label: "Settings", href: "/admin/settings", icon: Settings, keywords: "settings shipping taxes payments" },
];

const GROUPS = [
  { key: "orders", label: "Orders", icon: ShoppingCart },
  { key: "products", label: "Products", icon: Package },
  { key: "customers", label: "Customers", icon: User },
  { key: "collections", label: "Collections", icon: Layers },
  { key: "discounts", label: "Discounts", icon: Tag },
  { key: "pages", label: "Pages", icon: File },
  { key: "articles", label: "Blog posts", icon: Newspaper },
];

function toItems(results) {
  const items = [];
  for (const g of GROUPS) {
    for (const r of results?.[g.key] || []) {
      if (g.key === "orders") {
        items.push({ id: `o-${r.id}`, group: g.label, icon: g.icon, label: `Order #${r.orderNumber}`, hint: [r.shippingName || r.email, formatCurrency(r.total, r.currency)].filter(Boolean).join(" · "), href: `/admin/orders/${r.id}` });
      } else if (g.key === "products") {
        items.push({ id: `p-${r.id}`, group: g.label, icon: g.icon, image: r.image, label: r.title, hint: r.status === "active" ? "" : r.status, href: `/admin/products/${r.id}` });
      } else if (g.key === "customers") {
        items.push({ id: `c-${r.id}`, group: g.label, icon: g.icon, label: r.name, hint: r.email, href: `/admin/customers/${r.id}` });
      } else if (g.key === "collections") {
        items.push({ id: `l-${r.id}`, group: g.label, icon: g.icon, label: r.title, hint: r.status === "active" ? "" : r.status, href: `/admin/collections/${r.id}` });
      } else if (g.key === "discounts") {
        items.push({ id: `d-${r.id}`, group: g.label, icon: g.icon, label: r.code, hint: r.status, href: `/admin/discounts/${r.id}` });
      } else if (g.key === "pages") {
        items.push({ id: `g-${r.id}`, group: g.label, icon: g.icon, label: r.title, hint: r.status, href: `/admin/content/pages/${r.id}` });
      } else if (g.key === "articles") {
        items.push({ id: `b-${r.id}`, group: g.label, icon: g.icon, label: r.title, hint: r.status, href: `/admin/content/blog/${r.id}` });
      }
    }
  }
  return items;
}

/** Cmd/Ctrl+K (or the search box in the top bar) — jump to any order,
 * product, customer, collection, discount, page or blog post, or run a
 * common action. Arrow keys move, Enter opens, Esc closes. */
export function CommandPalette({ open, onClose }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setResults(null);
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const data = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (id === seq.current) setResults(data);
      } catch {
        if (id === seq.current) setResults({});
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const items = useMemo(() => {
    const query = q.trim().toLowerCase();
    const actions = ACTIONS.filter((a) => !query || `${a.label} ${a.keywords}`.toLowerCase().includes(query)).map((a) => ({
      ...a,
      group: query ? "Actions" : "Go to",
    }));
    return query ? [...toItems(results), ...actions.slice(0, 4)] : actions;
  }, [q, results]);

  useEffect(() => setActive(0), [items.length]);

  const go = useCallback(
    (item) => {
      if (!item) return;
      onClose();
      router.push(item.href);
    },
    [onClose, router]
  );

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    }
  }

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastGroup = null;
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={620}
      destroyOnHidden
      styles={{ content: { padding: 0, overflow: "hidden" }, body: { padding: 0 } }}
      style={{ top: 88 }}
      aria-label="Search"
    >
      <div className="flex items-center gap-3 px-4 h-14 border-b border-app-border">
        {loading ? <Loader2 size={18} className="text-ink-muted animate-spin" aria-hidden="true" /> : <Search size={18} className="text-ink-muted" aria-hidden="true" />}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search orders, products, customers…"
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls="cmdk-list"
          aria-activedescendant={items[active] ? `cmdk-${items[active].id}` : undefined}
          className="flex-1 min-w-0 h-full border-0 bg-transparent text-[15px] text-ink outline-none focus-visible:outline-none placeholder:text-ink-subtle"
        />
        <kbd className="hidden sm:inline-flex items-center h-6 px-1.5 rounded border border-app-border text-[11px] text-ink-muted font-sans">Esc</kbd>
      </div>

      <ul id="cmdk-list" ref={listRef} role="listbox" className="m-0 p-2 list-none max-h-[min(60vh,440px)] overflow-y-auto">
        {items.map((item, index) => {
          const header = item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          const Icon = item.icon;
          return (
            <li key={item.id} role="presentation">
              {header && <p className="m-0 px-2.5 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{header}</p>}
              <button
                type="button"
                id={`cmdk-${item.id}`}
                role="option"
                aria-selected={index === active}
                data-index={index}
                onMouseMove={() => setActive(index)}
                onClick={() => go(item)}
                className={`w-full flex items-center gap-3 px-2.5 h-11 rounded-lg border-0 text-left cursor-pointer ${index === active ? "bg-accent-soft" : "bg-transparent"}`}
              >
                <span className="w-7 h-7 rounded-md border border-app-border bg-app-surface flex items-center justify-center shrink-0 overflow-hidden text-ink-muted">
                  {item.image ? <img src={item.image} alt="" className="w-full h-full object-cover" /> : <Icon size={14} aria-hidden="true" />}
                </span>
                <span className="flex-1 min-w-0 flex items-baseline gap-2">
                  <span className="text-sm text-ink font-medium truncate">{item.label}</span>
                  {item.hint && <span className="text-xs text-ink-muted truncate">{item.hint}</span>}
                </span>
                {index === active && <CornerDownLeft size={14} className="text-ink-muted shrink-0" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
        {q.trim() && !loading && results && items.length === 0 && (
          <li className="px-3 py-8 text-center text-sm text-ink-muted">Nothing matches “{q.trim()}”.</li>
        )}
      </ul>
      <div className="hidden sm:flex items-center gap-4 px-4 h-10 border-t border-app-border text-[11.5px] text-ink-muted bg-app-bg">
        <span>
          <kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> to move
        </span>
        <span>
          <kbd className="font-sans">Enter</kbd> to open
        </span>
        <span className="ml-auto">Order numbers work too — try “1002”</span>
      </div>
    </Modal>
  );
}
