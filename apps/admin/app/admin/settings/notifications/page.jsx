import { serverApiFetch } from "@/lib/api";
import { NotificationSettings } from "./NotificationSettings";

export default async function SettingsNotificationsPage() {
  const [{ store, resolvedSettings, role }, me] = await Promise.all([serverApiFetch("/api/store"), serverApiFetch("/api/auth/me")]);
  return (
    <NotificationSettings
      store={store}
      settings={resolvedSettings}
      canEdit={role !== "staff"}
      hasGstInvoices={Boolean(me.entitlements?.features?.gst_invoices)}
    />
  );
}
