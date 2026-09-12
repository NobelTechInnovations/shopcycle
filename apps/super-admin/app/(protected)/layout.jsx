import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { SuperAdminNav } from "./SuperAdminNav";

export default async function SuperAdminLayout({ children }) {
  let me;
  try {
    me = await serverApiFetch("/api/auth/me");
  } catch {
    redirect("/login");
  }
  if (!me.user.isSuperAdmin) {
    // A store-owner session that wandered in here has nothing to "go back
    // to" in this app — it's a fully separate domain now, so just bounce
    // to this app's own login rather than an /admin path that doesn't
    // exist here.
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-app-bg">
      <SuperAdminNav userName={me.user.name} />
      <main className="flex-1 p-6 max-w-6xl w-full mx-auto">{children}</main>
    </div>
  );
}
