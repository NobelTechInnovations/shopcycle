"use client";

export function PageHeader({ title, breadcrumb, actions }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        {breadcrumb && <div className="text-xs text-ink-muted mb-1">{breadcrumb}</div>}
        <h1 className="text-xl font-semibold text-ink m-0">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
