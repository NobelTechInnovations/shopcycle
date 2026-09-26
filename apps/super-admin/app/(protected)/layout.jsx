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
      <div className="flex-1 min-w-0 flex flex-col">
        {!me.user.twoFactorEnabled && (
          // Every page, until it's fixed — this console can suspend any
          // store, so an account without a second factor is the single
          // biggest risk on the platform.
          <div className="flex items-center justify-between gap-4 px-6 py-2.5 text-[13px] bg-[#FEF3E2] text-[#92400E] border-b border-[#F5D9A8]">
            <span>
              <strong className="font-semibold">Two-step verification is off.</strong> Anyone with your password can
              control every store.
            </span>
            <a href="/security" className="font-semibold underline underline-offset-2 shrink-0">
              Turn it on
            </a>
          </div>
        )}
        <main className="flex-1 p-6 max-w-6xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
