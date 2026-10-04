import { TaxSettings } from "../TaxSettings";
import { SettingsSectionHeader } from "../SettingsNav";

export default function SettingsTaxesPage() {
  return (
    <div>
      <SettingsSectionHeader title="Taxes" description="Tax rates applied to orders at checkout, such as GST on your products." />
      <TaxSettings />
    </div>
  );
}
