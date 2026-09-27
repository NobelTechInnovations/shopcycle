import { serverApiFetch } from "@/lib/api";
import { SettingsSectionHeader } from "../SettingsNav";
import { DeveloperSettings } from "./DeveloperSettings";

export default async function SettingsApiPage() {
  const { role } = await serverApiFetch("/api/store");
  const canEdit = role !== "staff";
  const [keys, hooks] = canEdit ? await Promise.all([serverApiFetch("/api/developer/keys"), serverApiFetch("/api/developer/webhooks")]) : [null, null];
  return (
    <div>
      <SettingsSectionHeader
        title="API & webhooks"
        description="Connect your own software — an ERP, a warehouse, a CRM. API keys let it read or change store data; webhooks tell it the moment something happens."
      />
      <DeveloperSettings initialKeys={keys} initialHooks={hooks} canEdit={canEdit} />
    </div>
  );
}
