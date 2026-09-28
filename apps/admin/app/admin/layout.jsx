import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { AdminShell } from "@/components/AdminShell";

export default async function AdminLayout({ children }) {
  let me;
  try {
    me = await serverApiFetch("/api/auth/me");
  } catch {
    redirect("/login");
  }

  // A platform admin with no store of their own landing here (e.g. a
  // bookmark, or a stale link) belongs on the super-admin app entirely —
  // a genuinely separate app/origin (see NEXT_PUBLIC_SUPER_ADMIN_URL),
  // not a route inside this one. `redirect()` happily takes an absolute
  // URL for exactly this case; passing a relative "/super-admin" here
  // used to 404 (no such route exists in this app).
  if (!me.store && me.user.isSuperAdmin) {
    redirect(process.env.NEXT_PUBLIC_SUPER_ADMIN_URL || "http://localhost:3003");
  }

  // The billing engine decides whether the dashboard is open (GET
  // /api/auth/me → access, from billing/access.js — the same answer the
  // API enforces on every request). A locked store goes to the billing
  // page, a top-level route outside this layout; its storefront keeps
  // running unless billing took it offline too.
  if (me.store && me.access && me.access.dashboard === false) {
    redirect("/billing");
  }

  // A store created without a plan choice picks one first (and is offered
  // autopay, which it can skip) — /welcome, also outside this layout.
  if (me.store?.settings?.setup?.choosePlan && me.role !== "staff") {
    redirect("/welcome");
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
    <AdminShell user={me.user} store={me.store}>
      {children}
    </AdminShell>
  );
}
