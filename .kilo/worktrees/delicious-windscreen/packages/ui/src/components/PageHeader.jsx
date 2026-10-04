"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Every admin page's title row — same type as the dashboard's greeting so
 * the whole admin reads as one product.
 *   backHref  → a back arrow before the title (detail/edit pages)
 *   meta      → inline badges after the title (e.g. a status pill)
 *   subtitle  → one line of context under the title
 *   actions   → buttons, right-aligned
 * `breadcrumb` is still accepted for older pages.
 */
export function PageHeader({ title, subtitle, backHref, meta, actions, breadcrumb }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 mb-6">
      <div className="flex items-start gap-3 min-w-0">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back"
            className="mt-0.5 w-8 h-8 shrink-0 rounded-md border border-app-border bg-app-surface text-ink-muted hover:text-ink hover:bg-app-bg flex items-center justify-center transition-colors"
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </Link>
        )}
        <div className="min-w-0">
          {breadcrumb && <div className="text-xs text-ink-muted mb-1">{breadcrumb}</div>}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] leading-tight font-semibold text-ink m-0" style={{ letterSpacing: "-0.02em" }}>
              {title}
            </h1>
            {meta}
          </div>
          {subtitle && <p className="text-sm text-ink-muted mt-1 mb-0">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
