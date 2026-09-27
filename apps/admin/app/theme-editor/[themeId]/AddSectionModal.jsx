"use client";

import { useMemo, useState } from "react";
import { Modal, Input } from "antd";
import { Search } from "lucide-react";
import { sectionMeta, GROUP_ORDER } from "./section-meta";
import { GLOBAL_SECTION_TYPES } from "./schema-utils";

/** Pick a section type to add — grouped, searchable, each with a line on
 * what it's for. */
export function AddSectionModal({ open, onClose, catalog, onAdd, templateName = "index", presentTypes = [] }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const out = {};
    for (const [type, schema] of Object.entries(catalog)) {
      if (GLOBAL_SECTION_TYPES.includes(type)) continue;
      // Platform sections only on their own page (the product page's
      // reviews, related products); one-per-page sections once.
      if (schema.templates && !schema.templates.includes(templateName)) continue;
      if (schema.locked) continue;
      if (schema.limit && presentTypes.filter((t) => t === type).length >= schema.limit) continue;
      const meta = sectionMeta(type);
      const name = schema.name || type;
      if (q && !`${name} ${meta.text}`.toLowerCase().includes(q.toLowerCase())) continue;
      (out[meta.group] ||= []).push({ type, name, meta });
    }
    return GROUP_ORDER.filter((g) => out[g]).map((g) => [g, out[g]]);
  }, [catalog, q, templateName, presentTypes]);

  return (
    <Modal title="Add a section" open={open} onCancel={onClose} footer={null} width={680} destroyOnHidden afterOpenChange={(o) => !o && setQ("")}>
      <Input
        autoFocus
        allowClear
        prefix={<Search size={14} className="text-ink-subtle" aria-hidden="true" />}
        placeholder="Search sections"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4"
      />
      <div className="max-h-[60vh] overflow-y-auto flex flex-col gap-5 pr-1">
        {groups.map(([group, items]) => (
          <div key={group}>
            <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{group}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {items.map(({ type, name, meta }) => {
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      onAdd(type);
                      onClose();
                    }}
                    className="flex items-start gap-3 p-3 rounded-lg border border-app-border bg-app-surface text-left cursor-pointer hover:border-accent hover:bg-accent-soft/40 transition-colors"
                  >
                    <span className="w-9 h-9 rounded-md bg-app-bg text-ink flex items-center justify-center shrink-0">
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{name}</span>
                      <span className="block text-xs text-ink-muted mt-0.5 leading-snug">{meta.text}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="text-sm text-ink-muted text-center py-6 m-0">No sections match “{q}”.</p>}
      </div>
    </Modal>
  );
}
