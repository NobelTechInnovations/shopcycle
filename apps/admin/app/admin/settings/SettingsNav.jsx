"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, CreditCard, Users, Truck, Percent, Globe, Bell } from "lucide-react";

export const SETTINGS_SECTIONS = [
  { href: "/admin/settings", icon: Store, label: "General", hint: "Name, currency, timezone" },
  { href: "/admin/settings/billing", icon: CreditCard, label: "Plan & billing", hint: "Plan, fees, invoices" },
  { href: "/admin/settings/team", icon: Users, label: "Team", hint: "Staff and permissions" },
  { href: "/admin/settings/notifications", icon: Bell, label: "Notifications", hint: "Emails, returns, invoices" },
  { href: "/admin/settings/shipping", icon: Truck, label: "Shipping", hint: "Zones and rates" },
  { href: "/admin/settings/taxes", icon: Percent, label: "Taxes", hint: "Tax rates at checkout" },
  { href: "/admin/settings/domains", icon: Globe, label: "Domains", hint: "Your store's address" },
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
  return (
    <nav aria-label="Settings sections">
      <ul className="list-none m-0 p-0 flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
        {SETTINGS_SECTIONS.map(({ href, icon: Icon, label, hint }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 no-underline transition-colors ${
                  active ? "bg-app-surface shadow-card text-ink" : "text-ink-muted hover:bg-app-surface/70 hover:text-ink"
                }`}
              >
                <span
                  className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                    active ? "bg-accent-soft text-accent" : "bg-app-surface border border-app-border text-ink-muted"
                  }`}
                >
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium whitespace-nowrap">{label}</span>
                  <span className="hidden lg:block text-xs text-ink-subtle truncate">{hint}</span>
                </span>
              </Link>
            </li>
          );
        })}
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
