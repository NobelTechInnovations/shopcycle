import { serverApiFetch } from "@/lib/api";
import { PreferencesForm } from "./PreferencesForm";

export default async function PreferencesPage() {
  const { store, resolvedSettings, role } = await serverApiFetch("/api/store");
  return <PreferencesForm store={store} seo={resolvedSettings.seo} canEdit={role !== "staff"} />;
}
