"use client";

import { Button } from "antd";

// `icon` takes a rendered element (e.g. `<Palette size={32} />`), not a
// component reference — a bare component type isn't serializable across
// the Server->Client boundary when this is used from a Server Component
// page, which every "coming soon" stub in this app is.
export function EmptyState({ icon, title, description, actionLabel, onAction, secondary }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
      {icon && (
        <div
          className="w-14 h-14 rounded-2xl bg-app-bg border border-app-border text-ink-muted flex items-center justify-center [&_svg]:w-6 [&_svg]:h-6"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <div>
        <p className="text-[15px] font-semibold text-ink m-0">{title}</p>
        {description && <p className="text-[13px] text-ink-muted mt-1.5 mb-0 max-w-sm leading-relaxed">{description}</p>}
      </div>
      {(actionLabel || secondary) && (
        <div className="flex items-center gap-2">
          {actionLabel && onAction && (
            <Button type="primary" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondary}
        </div>
      )}
    </div>
  );
}
