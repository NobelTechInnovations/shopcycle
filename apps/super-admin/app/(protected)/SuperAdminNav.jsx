"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Button } from "antd";
import { Building2, CreditCard, Grid3x3, LogOut } from "lucide-react";
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
];

export function SuperAdminNav({ userName }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await apiFetch("/api/auth/super-admin-logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 border-r border-app-border bg-app-surface h-screen sticky top-0 flex flex-col">
      <div className="h-14 flex items-center px-4 border-b border-app-border">
        <span className="font-semibold text-ink">Platform Admin</span>
      </div>
      <Menu mode="inline" items={NAV_ITEMS} selectedKeys={[pathname]} style={{ border: "none", paddingTop: 8, flex: 1 }} />
      <div className="p-3 border-t border-app-border flex flex-col gap-2">
        <p className="text-xs text-ink-muted m-0 px-1">{userName}</p>
        <Button size="small" icon={<LogOut size={13} aria-hidden="true" />} onClick={handleLogout}>
          Log out
        </Button>
      </div>
    </aside>
  );
}
