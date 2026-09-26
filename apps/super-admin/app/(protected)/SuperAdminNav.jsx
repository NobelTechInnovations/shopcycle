"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, ConfigProvider } from "antd";
import { Building2, CreditCard, Grid3x3, Users, LogOut, ShieldCheck, ScrollText, Mail } from "lucide-react";
import { BrandMark } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const NAV_ITEMS = [
  {
    key: "/companies",
    icon: <Building2 size={16} aria-hidden="true" />,
    label: <Link href="/companies">Companies</Link>,
  },
  {
    key: "/plans",
    icon: <CreditCard size={16} aria-hidden="true" />,
    label: <Link href="/plans">Plans</Link>,
  },
  {
    key: "/apps",
    icon: <Grid3x3 size={16} aria-hidden="true" />,
    label: <Link href="/apps">Apps</Link>,
  },
  {
    key: "/customers",
    icon: <Users size={16} aria-hidden="true" />,
    label: <Link href="/customers">Customers</Link>,
  },
  { type: "divider", style: { borderColor: "rgba(255,255,255,0.08)", margin: "8px 12px" } },
  {
    key: "/audit-log",
    icon: <ScrollText size={16} aria-hidden="true" />,
    label: <Link href="/audit-log">Audit log</Link>,
  },
  {
    key: "/emails",
    icon: <Mail size={16} aria-hidden="true" />,
    label: <Link href="/emails">Emails</Link>,
  },
  {
    key: "/security",
    icon: <ShieldCheck size={16} aria-hidden="true" />,
    label: <Link href="/security">Security</Link>,
  },
];

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

/**
 * Deliberately dark, unlike the seller admin's light sidebar — the platform
 * console can suspend any store and read every store's customers, so it
 * should never be mistakable for a seller dashboard at a glance.
 */
export function SuperAdminNav({ userName }) {
  const pathname = usePathname();
  const router = useRouter();
  // Prefix match so detail pages (/customers/:id) keep their section lit.
  const selected = NAV_ITEMS.filter((i) => i.key).map((i) => i.key).filter((k) => pathname === k || pathname.startsWith(`${k}/`));

  async function handleLogout() {
    await apiFetch("/api/auth/super-admin-logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 flex flex-col" style={{ background: "#0B0B0F" }}>
      <Link href="/companies" className="h-14 flex items-center px-5 shrink-0" aria-label="Platform home">
        <BrandMark size={24} tone="dark" label="Platform" />
      </Link>
      <ConfigProvider
        theme={{
          components: {
            Menu: {
              darkItemBg: "transparent",
              darkItemColor: "rgba(245,245,244,0.62)",
              darkItemHoverBg: "rgba(255,255,255,0.06)",
              darkItemHoverColor: "#F5F5F4",
              darkItemSelectedBg: "rgba(124,92,255,0.22)",
              darkItemSelectedColor: "#FFFFFF",
            },
          },
        }}
      >
        <Menu
          mode="inline"
          theme="dark"
          items={NAV_ITEMS}
          selectedKeys={selected}
          style={{ border: "none", paddingTop: 4, flex: 1, background: "transparent" }}
        />
      </ConfigProvider>
      <div className="p-3 m-3 rounded-lg flex items-center gap-2.5" style={{ background: "rgba(255,255,255,0.05)" }}>
        <span className="w-8 h-8 rounded-full bg-brand-gradient text-white text-xs font-semibold flex items-center justify-center shrink-0">
          {initials(userName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium m-0 truncate" style={{ color: "#F5F5F4" }}>
            {userName}
          </p>
          <p className="text-[11px] m-0" style={{ color: "rgba(245,245,244,0.5)" }}>
            Platform operator
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Log out"
          title="Log out"
          className="w-8 h-8 rounded-md flex items-center justify-center bg-transparent border-0 cursor-pointer hover:bg-white/10"
          style={{ color: "rgba(245,245,244,0.7)" }}
        >
          <LogOut size={15} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
