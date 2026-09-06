import { serverApiFetch } from "@/lib/api";
import { DashboardView } from "./DashboardView";

export default async function DashboardPage() {
  const data = await serverApiFetch("/api/dashboard");
  return <DashboardView data={data} />;
}
