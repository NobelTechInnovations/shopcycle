import { PageHeader } from "@shopcycle/ui";
import { BillingTabs } from "./BillingTabs";

export default function BillingLayout({ children }) {
  return (
    <div>
      <PageHeader title="Billing" subtitle="Subscriptions, payments, GST and the rules the billing engine follows. Every action here is written to the audit log." />
      <BillingTabs />
      {children}
    </div>
  );
}
