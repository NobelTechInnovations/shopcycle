import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { Welcome } from "./Welcome";

// First visit after sign-up (or after "Create new store"): choose the plan
// the trial runs on, then turn on autopay or skip it. A top-level route like
// /billing — the admin layout sends flagged stores here, so it can't sit
// inside that layout.
export default async function WelcomePage() {
  let me;
  try {
    me = await serverApiFetch("/api/auth/me");
  } catch {
    redirect("/login");
  }
  if (!me.store || me.role === "staff" || !me.store.settings?.setup?.choosePlan) redirect("/admin");

  const billing = await serverApiFetch("/api/billing");
  return <Welcome initial={billing} storeName={me.store.name} userName={me.user?.name} />;
}
