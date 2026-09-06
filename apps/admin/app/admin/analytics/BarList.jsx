"use client";

// A deliberately dependency-free "chart" — a horizontal bar list, the same
// shape every analytics tool uses for "top X" breakdowns (top pages,
// countries, devices, sources). Good enough for this scope without pulling
// in a full charting library for three or four kinds of bar.
export function BarList({ items, labelKey = "label", valueKey = "count", renderLabel }) {
  const max = Math.max(1, ...items.map((i) => i[valueKey]));
  if (items.length === 0) return <p className="text-sm text-ink-muted">No data yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-32 shrink-0 text-xs text-ink-muted truncate" title={item[labelKey]}>
            {renderLabel ? renderLabel(item) : item[labelKey]}
          </div>
          <div className="flex-1 bg-app-border/40 rounded h-4 overflow-hidden">
            <div
              className="bg-brand h-full rounded"
              style={{ width: `${Math.max(4, (item[valueKey] / max) * 100)}%` }}
            />
          </div>
          <div className="w-10 shrink-0 text-xs text-right font-medium">{item[valueKey]}</div>
        </div>
      ))}
    </div>
  );
}

/** A tiny sparkline-style bar chart for "count per day" series. */
export function MiniBarChart({ series, height = 60 }) {
  const max = Math.max(1, ...series.map((d) => d.count));
  if (series.length === 0) return <p className="text-sm text-ink-muted">No data yet.</p>;
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {series.map((d, i) => (
        <div
          key={i}
          className="flex-1 bg-brand rounded-sm min-w-[4px]"
          style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
          title={`${new Date(d.date).toLocaleDateString()}: ${d.count}`}
        />
      ))}
    </div>
  );
}
