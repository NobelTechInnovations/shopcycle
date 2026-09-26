import { ShippingSettings } from "../ShippingSettings";
import { SettingsSectionHeader } from "../SettingsNav";

export default function SettingsShippingPage() {
  return (
    <div>
      <SettingsSectionHeader
        title="Shipping"
        description="Where you deliver and what shoppers pay for it. The matching rate is added at checkout."
      />
      <ShippingSettings />
    </div>
  );
}
