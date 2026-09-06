"use client";

import { PageHeader, EmptyState } from "@shopcycle/ui";

/** Every nav item in the target IA gets a route from Phase 1 onward, even
 * ones with no feature behind them yet — so the shell never needs
 * restructuring, and a merchant clicking around never hits a raw 404. */
export function ComingSoonPage({ title, description, icon }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="bg-app-surface border border-app-border rounded-md">
        <EmptyState icon={icon} title="Coming in a later phase" description={description} />
      </div>
    </div>
  );
}
