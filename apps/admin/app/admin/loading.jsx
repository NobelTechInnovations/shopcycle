/** Shown the moment a seller clicks through to another admin page, while the
 * page's data loads — the sidebar and top bar stay put around it. */
function Bar({ className = "" }) {
  return <div className={`rounded-md bg-ink/[0.06] ${className}`} />;
}

export default function AdminLoading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <Bar className="h-7 w-48" />
        <Bar className="h-9 w-28" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[14px] border border-app-border bg-app-surface p-5">
            <Bar className="h-3.5 w-24 mb-4" />
            <Bar className="h-7 w-20" />
          </div>
        ))}
      </div>
      <div className="rounded-[14px] border border-app-border bg-app-surface p-5">
        <Bar className="h-4 w-40 mb-5" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 py-3 border-t border-app-border first:border-t-0">
            <Bar className="h-9 w-9 shrink-0" />
            <Bar className="h-3.5 flex-1" />
            <Bar className="h-3.5 w-20" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
