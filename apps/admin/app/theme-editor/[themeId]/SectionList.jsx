"use client";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Tooltip } from "antd";
import { GripVertical, Copy, Trash2, Eye, EyeOff, Plus, PanelTop, PanelBottom, ChevronRight } from "lucide-react";
import { useConfirmDialog } from "@shopcycle/ui";
import { useEditorStore } from "./store";
import { sectionMeta } from "./section-meta";

// A hint of what's in a section, so rows are told apart at a glance
// ("Product grid · Best sellers").
function subtitleFor(entry) {
  const s = entry.settings || {};
  const text = s.heading || s.title || s.text || s.eyebrow || "";
  return String(text).replace(/<[^>]+>/g, "").slice(0, 60);
}

function SortableSectionRow({ id, entry, label, locked, selected, onSelect, onDuplicate, onDelete, onToggleHide }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const Icon = sectionMeta(entry.type).icon;
  const sub = subtitleFor(entry);
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1 pl-1 pr-1.5 rounded-lg border transition-colors ${
        selected ? "border-accent bg-accent-soft/50" : "border-transparent hover:bg-app-bg"
      } ${isDragging ? "shadow-card relative z-10 bg-app-surface" : ""}`}
    >
      {/* Keyboard users: Tab to this handle, Space to pick up, arrows to
       * move, Space to drop (dnd-kit's KeyboardSensor). */}
      <button type="button" className="cursor-grab text-ink-subtle hover:text-ink p-1 bg-transparent border-0" aria-label={`Reorder ${label}`} {...attributes} {...listeners}>
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`flex-1 min-w-0 flex items-center gap-2 text-left py-2 bg-transparent border-0 cursor-pointer ${entry.disabled ? "opacity-50" : ""}`}
        onClick={() => onSelect(id)}
      >
        <Icon size={15} className="text-ink-muted shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-ink truncate">{label}</span>
          {(sub || entry.disabled) && (
            <span className="block text-[11px] text-ink-muted truncate">{entry.disabled ? "Hidden" : sub}</span>
          )}
        </span>
      </button>
      {locked ? (
        <span className="text-[10.5px] text-ink-subtle pr-1">Always shown</span>
      ) : (
      <div className={`flex items-center ${selected ? "" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"} transition-opacity`}>
        <Tooltip title={entry.disabled ? "Show" : "Hide"}>
          <Button
            size="small"
            type="text"
            icon={entry.disabled ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
            aria-label={entry.disabled ? `Show ${label}` : `Hide ${label}`}
            onClick={() => onToggleHide(id)}
          />
        </Tooltip>
        <Tooltip title="Duplicate">
          <Button size="small" type="text" icon={<Copy size={13} aria-hidden="true" />} aria-label={`Duplicate ${label}`} onClick={() => onDuplicate(id)} />
        </Tooltip>
        <Tooltip title="Delete">
          <Button size="small" type="text" danger icon={<Trash2 size={13} aria-hidden="true" />} aria-label={`Delete ${label}`} onClick={() => onDelete(id)} />
        </Tooltip>
      </div>
      )}
    </div>
  );
}

function FixedRow({ icon: Icon, label, hint, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-dashed border-app-border bg-transparent text-left cursor-pointer hover:bg-app-bg"
    >
      <Icon size={15} className="text-ink-muted shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        <span className="block text-[11px] text-ink-muted truncate">{hint}</span>
      </span>
      <ChevronRight size={14} className="text-ink-subtle" aria-hidden="true" />
    </button>
  );
}

export function SectionList({ catalog, onAddSection, onOpenGlobal, pageLabel = "Home page", hint }) {
  const template = useEditorStore((s) => s.template);
  const selectedSectionKey = useEditorStore((s) => s.selectedSectionKey);
  const selectSection = useEditorStore((s) => s.selectSection);
  const reorderSections = useEditorStore((s) => s.reorderSections);
  const duplicateSection = useEditorStore((s) => s.duplicateSection);
  const removeSection = useEditorStore((s) => s.removeSection);
  const toggleSectionDisabled = useEditorStore((s) => s.toggleSectionDisabled);
  const { confirmDialog } = useConfirmDialog();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    reorderSections(template.order.indexOf(active.id), template.order.indexOf(over.id));
  }

  function handleDelete(key) {
    const label = catalog[template.sections[key].type]?.name || template.sections[key].type;
    confirmDialog({
      title: `Delete "${label}"?`,
      description: "You can undo this until you leave the editor.",
      okText: "Delete",
      danger: true,
      onConfirm: () => {
        removeSection(key);
        if (selectedSectionKey === key) selectSection(null);
      },
    });
  }

  function handleDuplicate(key) {
    duplicateSection(key, `${key}-copy-${Math.random().toString(36).slice(2, 8)}`);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 pt-3 pb-2">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{pageLabel}</p>
        <p className="m-0 mt-1 text-[11.5px] text-ink-muted leading-snug">{hint || "Click a section to edit it, drag to reorder. Press Save when you’re happy."}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3 flex flex-col gap-1">
        <FixedRow icon={PanelTop} label="Header" hint="Logo, menu, announcement bar" onClick={onOpenGlobal} />
        <div className="my-1 flex flex-col gap-0.5">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={template.order} strategy={verticalListSortingStrategy}>
              {template.order.map((key) => (
                <SortableSectionRow
                  key={key}
                  id={key}
                  entry={template.sections[key]}
                  label={catalog[template.sections[key].type]?.name || template.sections[key].type}
                  locked={Boolean(catalog[template.sections[key].type]?.locked)}
                  selected={key === selectedSectionKey}
                  onSelect={selectSection}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onToggleHide={toggleSectionDisabled}
                />
              ))}
            </SortableContext>
          </DndContext>
          {template.order.length === 0 && <p className="text-xs text-ink-muted text-center py-4 m-0">No sections yet — add your first one.</p>}
        </div>
        <Button type="dashed" block icon={<Plus size={14} aria-hidden="true" />} onClick={onAddSection}>
          Add section
        </Button>
        <div className="mt-1">
          <FixedRow icon={PanelBottom} label="Footer" hint="Links, contact, newsletter" onClick={onOpenGlobal} />
        </div>
      </div>
    </div>
  );
}
