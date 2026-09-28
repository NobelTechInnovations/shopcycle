import { serverApiFetch } from "@/lib/api";
import { PolicySettings } from "./PolicySettings";

export default async function SettingsPoliciesPage() {
  const [{ policies }, me] = await Promise.all([serverApiFetch("/api/pages/policies"), serverApiFetch("/api/auth/me")]);
  return <PolicySettings initial={policies} store={me.store} />;
}
