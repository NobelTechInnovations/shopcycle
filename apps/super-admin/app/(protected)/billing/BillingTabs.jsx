"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/billing", label: "Overview" },
  { href: "/billing/subscriptions", label: "Subscriptions" },
  { href: "/billing/limit-requests", label: "Limit requests" },
  { href: "/billing/settings", label: "Settings" },
];

/** Section navigation for the billing console. */
export function BillingTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Billing" className="flex gap-1 border-b border-app-border mb-6 overflow-x-auto">
      {TABS.map((t) => {
        const active = t.href === "/billing" ? pathname === "/billing" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px ${active ? "border-ink text-ink font-medium" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
