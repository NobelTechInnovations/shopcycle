import { SettingsSectionHeader } from "../SettingsNav";
import { ConnectedAccounts } from "./ConnectedAccounts";

export default function SettingsAccountsPage() {
  return (
    <div>
      <SettingsSectionHeader
        title="Connected accounts"
        description="Sign in with Google and Facebook once for your store. Every app that needs them — reviews, Instagram feed, selling on Google and Facebook, pixel, ads, WhatsApp — uses these, so you're never asked to connect again."
      />
      <ConnectedAccounts />
    </div>
  );
}
