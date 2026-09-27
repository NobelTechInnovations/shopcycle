"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, CreditCard, Users, Truck, Percent, Globe, Bell, Wallet, Braces, Code2, Search, ShoppingCart } from "lucide-react";

// Shopify-style: one compact row per section, grouped, with a filter.
export const SETTINGS_SECTIONS = [
  { href: "/admin/settings", icon: Store, label: "General", hint: "Name, currency, timezone" },
  { href: "/admin/settings/billing", icon: CreditCard, label: "Plan & billing", hint: "Plan, fees, invoices" },
  { href: "/admin/settings/team", icon: Users, label: "Users & permissions", hint: "Staff and roles" },
  { href: "/admin/settings/payments", icon: Wallet, label: "Payments", hint: "Gateways and cash on delivery" },
  { href: "/admin/settings/checkout", icon: ShoppingCart, label: "Checkout", hint: "Form fields at checkout" },
  { href: "/admin/settings/shipping", icon: Truck, label: "Shipping and delivery", hint: "Zones and rates" },
  { href: "/admin/settings/taxes", icon: Percent, label: "Taxes", hint: "Tax rates at checkout" },
  { href: "/admin/settings/domains", icon: Globe, label: "Domains", hint: "Your store's address" },
  { href: "/admin/settings/notifications", icon: Bell, label: "Notifications", hint: "Emails, returns, invoices" },
  { href: "/admin/settings/custom-data", icon: Braces, label: "Custom data", hint: "Extra fields for products" },
  { href: "/admin/settings/api", icon: Code2, label: "API & webhooks", hint: "Access keys and event hooks" },
];

function isActive(pathname, href) {
  if (href === "/admin/settings") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Settings' own section list — a real link per section, so any settings
 * page can be bookmarked or shared. Vertical on desktop; a scrollable row
 * of chips on narrow screens. */
export function SettingsNav() {
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const shown = SETTINGS_SECTIONS.filter((s) => !q || `${s.label} ${s.hint}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <nav aria-label="Settings sections" className="lg:bg-app-surface lg:border lg:border-app-border lg:rounded-xl lg:p-2 lg:shadow-card">
      <label className="hidden lg:flex items-center gap-2 h-9 px-2.5 mb-1.5 rounded-lg border border-app-border bg-app-bg text-ink-muted">
        <Search size={14} aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search settings"
          aria-label="Search settings"
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-ink placeholder:text-ink-subtle"
        />
      </label>
      <ul className="list-none m-0 p-0 flex lg:flex-col gap-0.5 overflow-x-auto pb-1 lg:pb-0">
        {shown.map(({ href, icon: Icon, label, hint }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                title={hint}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 no-underline text-[13.5px] transition-colors whitespace-nowrap ${
                  active ? "bg-app-bg text-ink font-semibold" : "text-ink-muted hover:bg-app-bg hover:text-ink"
                }`}
              >
                <Icon size={16} className={active ? "text-ink" : "text-ink-subtle"} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-2.5 py-2 text-xs text-ink-muted">No settings match.</li>}
      </ul>
    </nav>
  );
}

/** Header for one settings section — keeps every section's title, help
 * text, and spacing identical. */
export function SettingsSectionHeader({ title, description, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h2 className="text-[17px] font-semibold text-ink m-0" style={{ letterSpacing: "-0.01em" }}>
          {title}
        </h2>
        {description && <p className="text-sm text-ink-muted mt-1 mb-0 max-w-xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
