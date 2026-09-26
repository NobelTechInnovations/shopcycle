import { TeamSettings } from "../TeamSettings";
import { SettingsSectionHeader } from "../SettingsNav";

export default function SettingsTeamPage() {
  return (
    <div>
      <SettingsSectionHeader
        title="Team"
        description="Owners and admins can change everything, including billing. Staff manage products, orders, and customers."
      />
      <TeamSettings />
    </div>
  );
}
