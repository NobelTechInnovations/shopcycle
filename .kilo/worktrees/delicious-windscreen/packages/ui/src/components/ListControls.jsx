"use client";

import { Input, Button } from "antd";
import { Search, Trash2 } from "lucide-react";

/** The search box every index page uses: searches on Enter, and clearing
 * it (× or deleting the text) resets the list immediately. */
export function SearchInput({ placeholder = "Search", onSearch, className = "!w-60" }) {
  return (
    <Input
      prefix={<Search size={14} className="text-ink-subtle" aria-hidden="true" />}
      placeholder={placeholder}
      allowClear
      aria-label={placeholder}
      className={className}
      onPressEnter={(e) => onSearch(e.target.value.trim())}
      onChange={(e) => {
        if (!e.target.value) onSearch("");
      }}
    />
  );
}

/** Row-level delete: quiet grey until hovered, so a list of them doesn't
 * read as a column of alarms. Stops the click reaching the row's own
 * "open" handler. */
export function DeleteIconButton({ label, onClick }) {
  return (
    <Button
      type="text"
      size="small"
      className="!text-ink-subtle hover:!text-status-danger"
      icon={<Trash2 size={14} aria-hidden="true" />}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    />
  );
}
