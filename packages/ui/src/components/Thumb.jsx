"use client";

import { ImageIcon } from "lucide-react";

/** A square thumbnail for a list row (product, collection, file). Falls
 * back to a neutral icon tile when there's no image, so rows with and
 * without photos still line up. */
export function Thumb({ src, alt = "", size = 40, icon }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 overflow-hidden rounded-lg border border-app-border bg-app-bg text-ink-subtle"
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        icon || <ImageIcon size={Math.round(size * 0.42)} strokeWidth={1.75} aria-hidden="true" />
      )}
    </span>
  );
}
