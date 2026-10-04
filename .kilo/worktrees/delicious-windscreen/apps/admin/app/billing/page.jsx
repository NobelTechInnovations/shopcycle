import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { CompleteSubscription } from "./CompleteSubscription";

// A top-level route (a sibling of /login), not under /admin: the admin
// layout sends every locked store here, so this page must sit outside that
// layout's own lock check. Everything shown — amounts, what's locked — is
// the billing engine's answer (GET /api/billing).
export default async function BillingPage() {
  let me;
  try {
    me = await serverApiFetch("/api/auth/me");
  } catch {
    redirect("/login");
  }
  if (!me.store) redirect("/admin");

  const billing = await serverApiFetch("/api/billing");
  return <CompleteSubscription initial={billing} storeName={me.store.name} role={me.role} />;
}
