"use client";

/**
 * The container every index page (products, orders, customers...) uses:
 * one card holding view tabs, a toolbar, and the table — the way Shopify's
 * index pages work, instead of a loose filter row floating above a
 * separately bordered table.
 *
 *   tabs        [{ key, label, count? }] — saved-view style filter tabs
 *   activeTab / onTabChange
 *   toolbar     search box / filters, shown on the tab row's right (or
 *               alone on a row when there are no tabs)
 *   footer      optional, under the table (e.g. "Load more")
 */
export function ListCard({ tabs, activeTab, onTabChange, toolbar, footer, children }) {
  const hasHeader = (tabs && tabs.length > 0) || toolbar;
  return (
    <div className="oy-list-card bg-app-surface border border-app-border rounded-[14px] shadow-card overflow-hidden">
      {hasHeader && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 pt-2 border-b border-app-border">
          {tabs && tabs.length > 0 ? (
            <div role="tablist" className="flex items-center gap-1 -mb-px overflow-x-auto">
              {tabs.map((tab) => {
                const active = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onTabChange?.(tab.key)}
                    className={`relative px-3 h-10 text-[13px] font-medium whitespace-nowrap bg-transparent border-0 cursor-pointer transition-colors ${
                      active ? "text-ink" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {tab.label}
                    {typeof tab.count === "number" && (
                      <span className="ml-1.5 text-[12px] text-ink-subtle tabular-nums">{tab.count}</span>
                    )}
                    <span
                      className={`absolute left-2 right-2 bottom-0 h-[2px] rounded-full transition-colors ${
                        active ? "bg-ink" : "bg-transparent"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            <span />
          )}
          {toolbar && <div className="flex items-center gap-2 py-2">{toolbar}</div>}
        </div>
      )}
      {children}
      {footer && <div className="border-t border-app-border px-4 py-3">{footer}</div>}
    </div>
  );
}
