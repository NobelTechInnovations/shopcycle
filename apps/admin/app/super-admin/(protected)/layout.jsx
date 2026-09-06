import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { SuperAdminNav } from "./SuperAdminNav";

export default async function SuperAdminLayout({ children }) {
  let me;
  try {
    me = await serverApiFetch("/api/auth/me");
  } catch {
    redirect("/super-admin/login");
  }
  if (!me.user.isSuperAdmin) {
    redirect(me.store ? "/admin" : "/super-admin/login");
  }

  return (
    <div className="flex min-h-screen bg-app-bg">
      <SuperAdminNav userName={me.user.name} hasStore={Boolean(me.store)} />
      <main className="flex-1 p-6 max-w-6xl w-full mx-auto">{children}</main>
    </div>
  );
}
