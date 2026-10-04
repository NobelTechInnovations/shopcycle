import { serverApiFetch } from "@/lib/api";
import { SettingsSectionHeader } from "../SettingsNav";
import { PaymentSettings } from "./PaymentSettings";

export default async function SettingsPaymentsPage() {
  const [{ role, store }, data] = await Promise.all([serverApiFetch("/api/store"), serverApiFetch("/api/payments")]);
  return (
    <div>
      <SettingsSectionHeader
        title="Payments"
        description="Choose how customers pay. Online payments go straight to your own gateway account — connect one or several, and try them in test mode first."
      />
      <PaymentSettings initial={data} currency={store.currency} canEdit={role !== "staff"} />
    </div>
  );
}
