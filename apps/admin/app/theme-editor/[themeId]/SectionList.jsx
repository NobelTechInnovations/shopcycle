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
import { Button } from "antd";
import { GripVertical, Copy, Trash2, Eye, EyeOff, Plus } from "lucide-react";
import { useConfirmDialog } from "@shopcycle/ui";
import { useEditorStore } from "./store";

function SortableSectionRow({ id, entry, label, selected, onSelect, onDuplicate, onDelete, onToggleHide }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: entry.disabled ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 px-2 py-2 rounded-md border ${
        selected ? "border-brand bg-app-bg" : "border-transparent hover:bg-app-bg"
      } ${isDragging ? "shadow-card relative z-10" : ""}`}
    >
      {/* Keyboard users: Tab to this handle, Space to pick up, arrow keys to
       * move, Space again to drop — dnd-kit's KeyboardSensor below wires
       * this up; it's not just a pointer-drag affordance. */}
      <button type="button" className="cursor-grab text-ink-muted p-1" aria-label={`Reorder ${label}`} {...attributes} {...listeners}>
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <button type="button" className="flex-1 text-left text-sm truncate py-1" onClick={() => onSelect(id)}>
        {label}
      </button>
      <Button
        size="small"
        type="text"
        icon={entry.disabled ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
        aria-label={entry.disabled ? `Show ${label}` : `Hide ${label}`}
        onClick={() => onToggleHide(id)}
      />
      <Button size="small" type="text" icon={<Copy size={13} aria-hidden="true" />} aria-label={`Duplicate ${label}`} onClick={() => onDuplicate(id)} />
      <Button size="small" type="text" danger icon={<Trash2 size={13} aria-hidden="true" />} aria-label={`Delete ${label}`} onClick={() => onDelete(id)} />
    </div>
  );
}

export function SectionList({ catalog, onAddSection }) {
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
      description: "This can't be undone once the theme is saved — Undo still works before that.",
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
    <div className="p-3 flex flex-col gap-1 h-full overflow-y-auto">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={template.order} strategy={verticalListSortingStrategy}>
          {template.order.map((key) => (
            <SortableSectionRow
              key={key}
              id={key}
              entry={template.sections[key]}
              label={catalog[template.sections[key].type]?.name || template.sections[key].type}
              selected={key === selectedSectionKey}
              onSelect={selectSection}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onToggleHide={toggleSectionDisabled}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button type="dashed" icon={<Plus size={14} aria-hidden="true" />} className="mt-2" onClick={onAddSection}>
        Add section
      </Button>
    </div>
  );
}
