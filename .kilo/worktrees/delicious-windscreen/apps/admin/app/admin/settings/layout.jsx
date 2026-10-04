import { PageHeader } from "@shopcycle/ui";
import { SettingsNav } from "./SettingsNav";

export default function SettingsLayout({ children }) {
  return (
    <div>
      <div className="print:hidden">
        <PageHeader title="Settings" subtitle="How your store runs — plan, team, shipping, taxes, and more." />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-6 items-start print:block">
        <aside className="lg:sticky lg:top-20 print:hidden">
          <SettingsNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
