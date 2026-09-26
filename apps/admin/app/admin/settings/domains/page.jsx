import { serverApiFetch } from "@/lib/api";
import { DomainSettings } from "../DomainSettings";
import { SettingsSectionHeader } from "../SettingsNav";

export default async function SettingsDomainsPage() {
  const { store } = await serverApiFetch("/api/store");
  return (
    <div>
      <SettingsSectionHeader
        title="Domains"
        description="Your store works on its free Oyklane address right away. Connect a domain you own whenever you're ready."
      />
      <DomainSettings store={store} />
    </div>
  );
}
