import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

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
