"use client";

import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Upload } from "antd";

function Item({ originNode, file, index }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: file.uid });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="relative h-full"
      style={{ transform: CSS.Translate.toString(transform), transition, cursor: "grab", opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 2 : undefined }}
      title="Drag to reorder"
    >
      {originNode}
      {index === 0 && <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-ink/80 px-1.5 py-0.5 text-[10px] font-medium text-white">Main</span>}
    </div>
  );
}

/** antd's picture-card Upload whose photos can be dragged into order
 * (the first is the main one). `onReorder(fromUid, toUid)`. */
export function SortableUpload({ fileList, onReorder, children, ...props }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) onReorder(active.id, over.id);
      }}
    >
      <SortableContext items={fileList.map((f) => f.uid)} strategy={rectSortingStrategy}>
        <Upload {...props} fileList={fileList} itemRender={(originNode, file) => <Item originNode={originNode} file={file} index={fileList.findIndex((f) => f.uid === file.uid)} />}>
          {children}
        </Upload>
      </SortableContext>
    </DndContext>
  );
}

export const moveByUid = (list, from, to) => {
  const a = list.findIndex((x) => x.uid === from);
  const b = list.findIndex((x) => x.uid === to);
  return a < 0 || b < 0 ? list : arrayMove(list, a, b);
};
