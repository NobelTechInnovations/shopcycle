import { serverApiFetch } from "@/lib/api";
import { DomainSettings } from "../DomainSettings";
import { SettingsSectionHeader } from "../SettingsNav";

export default async function SettingsDomainsPage() {
  const { role } = await serverApiFetch("/api/store");
  return (
    <div>
      <SettingsSectionHeader
        title="Domains"
        description="Your store is live on its free Oyklane address right away. Connect a domain you own whenever you're ready."
      />
      <DomainSettings canEdit={role !== "staff"} />
    </div>
  );
}
