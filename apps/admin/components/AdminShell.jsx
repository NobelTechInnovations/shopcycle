"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Drawer } from "antd";
import { Sidebar, SidebarNav } from "./Sidebar";
import { Topbar } from "./Topbar";
import { BillingBanner } from "./BillingBanner";

/**
 * The admin frame: fixed sidebar on desktop; below `lg` the sidebar
 * becomes a drawer opened from the top bar's menu button, so a phone gets
 * the full screen width for the page itself. The drawer closes itself on
 * navigation — tapping a menu item should land you on the page, not leave
 * the menu covering it.
 */
export function AdminShell({ user, store, children }) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-app-bg">
      <Sidebar />
      <Drawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        placement="left"
        width={272}
        closable={false}
        styles={{ body: { padding: 0 } }}
        className="lg:hidden"
        aria-label="Main menu"
      >
        <SidebarNav />
      </Drawer>
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar user={user} store={store} onOpenNav={() => setNavOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto">
          <BillingBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
