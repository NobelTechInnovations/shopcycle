import { serverApiFetch } from "@/lib/api";
import { SettingsSectionHeader } from "../SettingsNav";
import { CheckoutSettings } from "./CheckoutSettings";

export default async function SettingsCheckoutPage() {
  const { store, resolvedSettings, role } = await serverApiFetch("/api/store");
  return (
    <div>
      <SettingsSectionHeader
        title="Checkout"
        description="Choose what the checkout form asks for. Fewer fields means faster checkout — add company name and GSTIN if you sell to businesses."
      />
      <CheckoutSettings initial={resolvedSettings.checkout} storeName={store.name} canEdit={role !== "staff"} />
    </div>
  );
}
