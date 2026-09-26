import { serverApiFetch } from "@/lib/api";
import { DashboardView } from "./DashboardView";

export default async function DashboardPage() {
  const [data, me] = await Promise.all([serverApiFetch("/api/dashboard"), serverApiFetch("/api/auth/me")]);
  return <DashboardView data={data} user={me.user} />;
}
