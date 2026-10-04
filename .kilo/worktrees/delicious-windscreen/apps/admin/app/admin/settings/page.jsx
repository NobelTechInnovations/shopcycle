import { serverApiFetch } from "@/lib/api";
import { GeneralSettings } from "./GeneralSettings";

export default async function SettingsGeneralPage() {
  const { store } = await serverApiFetch("/api/store");
  return <GeneralSettings store={store} />;
}
