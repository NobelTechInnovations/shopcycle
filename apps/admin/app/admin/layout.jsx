import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

// Mirrors apps/api/src/modules/billing/access.js#isAdminBlocked — kept as a
// tiny duplicate rather than a cross-app import (the admin app has no
// access to the API's source tree at runtime). `me.accessState` itself is
// computed server-side by GET /api/auth/me from the same access.js.
function isAdminBlocked(accessState) {
  return accessState === "needs_plan" || accessState === "admin_blocked" || accessState === "storefront_blocked";
}

export default async function AdminLayout({ children }) {
  let me;
  try {
    me = await serverApiFetch("/api/auth/me");
  } catch {
    redirect("/login");
  }

  if (!me.store && me.user.isSuperAdmin) {
    redirect("/super-admin");
  }

  // No plan chosen yet, or billing has lapsed long enough to lock the
  // admin out — the billing screen itself (a top-level route, outside
  // this layout) is the only way out, so send every other /admin/* page
  // there. Keep the storefront running regardless (see storefront/
  // service.js's separate, later storefront_blocked cutoff).
  if (me.store && isAdminBlocked(me.accessState)) {
    redirect("/billing");
  }

  if (me.store?.status === "suspended") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-bg px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-ink mb-2">Store suspended</h1>
          <p className="text-sm text-ink-muted">
            {me.store.name} has been suspended. Contact support for details.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-app-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar user={me.user} store={me.store} />
        <main className="flex-1 p-6 max-w-6xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
