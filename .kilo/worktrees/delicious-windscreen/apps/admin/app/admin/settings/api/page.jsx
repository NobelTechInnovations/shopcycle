import Link from "next/link";
import { Lock } from "lucide-react";
import { serverApiFetch } from "@/lib/api";
import { SettingsSectionHeader } from "../SettingsNav";
import { DeveloperSettings } from "./DeveloperSettings";

export default async function SettingsApiPage() {
  const [{ role }, me] = await Promise.all([serverApiFetch("/api/store"), serverApiFetch("/api/auth/me")]);
  // API keys and webhooks are part of Pro (the API refuses new keys and
  // key requests otherwise). Existing keys stay listed so they can be revoked.
  const included = Boolean(me.entitlements?.features?.api_access);
  const canEdit = role !== "staff";
  const [keys, hooks] = canEdit ? await Promise.all([serverApiFetch("/api/developer/keys"), serverApiFetch("/api/developer/webhooks")]) : [null, null];
  return (
    <div>
      <SettingsSectionHeader
        title="API & webhooks"
        description="Connect your own software — an ERP, a warehouse, a CRM. API keys let it read or change store data; webhooks tell it the moment something happens."
      />
      {!included && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app-border bg-app-surface px-4 py-3 mb-5">
          <p className="text-sm text-ink m-0 inline-flex items-center gap-2">
            <Lock size={15} aria-hidden="true" /> API access and webhooks are part of the Pro plan.
          </p>
          <Link href="/admin/settings/billing" className="text-sm font-medium text-ink underline">
            See plans
          </Link>
        </div>
      )}
      <DeveloperSettings initialKeys={keys} initialHooks={hooks} canEdit={canEdit && included} />
    </div>
  );
}
