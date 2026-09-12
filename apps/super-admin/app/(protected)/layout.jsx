import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { SuperAdminNav } from "./SuperAdminNav";

export default async function SuperAdminLayout({ children }) {
  // Its own endpoint, its own cookie — never /api/auth/me (the seller's),
  // so a store owner's session can never satisfy this check no matter
  // which cookies happen to also be present for this domain.
  let me;
  try {
    me = await serverApiFetch("/api/auth/super-admin-me");
  } catch {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-app-bg">
      <SuperAdminNav userName={me.user.name} />
      <main className="flex-1 p-6 max-w-6xl w-full mx-auto">{children}</main>
    </div>
  );
}
