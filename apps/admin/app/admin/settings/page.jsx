import { serverApiFetch } from "@/lib/api";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const { store } = await serverApiFetch("/api/store");
  return <SettingsForm store={store} />;
}
