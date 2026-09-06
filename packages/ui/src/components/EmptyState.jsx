"use client";

import { Button } from "antd";

// `icon` takes a rendered element (e.g. `<Palette size={32} />`), not a
// component reference — a bare component type isn't serializable across
// the Server->Client boundary when this is used from a Server Component
// page, which every "coming soon" stub in this app is.
export function EmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
      {icon && <div className="text-ink-muted" aria-hidden="true">{icon}</div>}
      <div>
        <p className="font-medium text-ink">{title}</p>
        {description && <p className="text-sm text-ink-muted mt-1 max-w-sm">{description}</p>}
      </div>
      {actionLabel && onAction && (
        <Button type="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
