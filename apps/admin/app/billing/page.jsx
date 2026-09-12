import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { PlanChooser } from "./PlanChooser";

// Deliberately a top-level route (sibling of /login, /register), not nested
// under /admin — admin/layout.jsx redirects every blocked store here, so
// this page must live outside that layout's own redirect check or a
// blocked store could never reach it at all.
export default async function BillingPage() {
  let me;
  try {
    me = await serverApiFetch("/api/auth/me");
  } catch {
    redirect("/login");
  }
  if (!me.store) redirect("/admin");

  const { plans, billing } = await serverApiFetch("/api/store/billing");

  return <PlanChooser plans={plans} billing={billing} storeName={me.store.name} currentPlanId={me.store.planId} />;
}
