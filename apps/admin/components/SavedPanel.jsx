"use client";

import Link from "next/link";
import { Button } from "antd";
import { CheckCircle2, Copy, ExternalLink, Plus, X } from "lucide-react";

/**
 * Shown after a product or collection is saved — the seller stays on the
 * item and picks what's next: see it live, add another, or duplicate it.
 */
export function SavedPanel({ title, detail, viewUrl, viewDisabledHint, addHref, addLabel, duplicateHref, onClose }) {
  return (
    <div role="status" className="mb-5 rounded-[14px] border border-status-success/30 bg-status-success/5 px-4 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <CheckCircle2 size={18} className="text-status-success mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="m-0 text-sm font-semibold text-ink">{title}</p>
          {detail && <p className="m-0 text-[13px] text-ink-muted">{detail}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {viewUrl ? (
          <Button size="small" href={viewUrl} target="_blank" icon={<ExternalLink size={13} aria-hidden="true" />}>
            View on store
          </Button>
        ) : viewDisabledHint ? (
          <span className="text-xs text-ink-muted">{viewDisabledHint}</span>
        ) : null}
        {duplicateHref && (
          <Link href={duplicateHref}>
            <Button size="small" icon={<Copy size={13} aria-hidden="true" />}>
              Duplicate
            </Button>
          </Link>
        )}
        {addHref && (
          <Link href={addHref}>
            <Button size="small" type="primary" icon={<Plus size={13} aria-hidden="true" />}>
              {addLabel}
            </Button>
          </Link>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Dismiss" className="p-1 rounded text-ink-muted hover:text-ink">
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
