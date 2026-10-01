"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Select, Button, Card, Tooltip, App } from "antd";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trash2, GripVertical, IndentIncrease, IndentDecrease, CornerDownRight, ChevronDown } from "lucide-react";
import { PageHeader, SaveBar } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

// The handles a theme actually looks for — see header.liquid / footer.liquid's
// `menu` setting defaults in both theme packages. A merchant typing an
// arbitrary handle here would create a menu no section ever renders, so
// this is a closed choice, not free text.
const HANDLE_OPTIONS = [
  { value: "main-menu", label: "main-menu — Header navigation" },
  { value: "footer-menu", label: "footer-menu — Footer navigation" },
];

const LINK_TYPES = [
  { value: "home", label: "Home page" },
  { value: "collection", label: "Collection" },
  { value: "product", label: "Product" },
  { value: "page", label: "Page" },
  { value: "custom", label: "Custom URL" },
];

// A link can sit two levels deep: Menu ▸ Submenu ▸ Sub-submenu.
const MAX_DEPTH = 2;
const INDENT = 32;

/** Splits a stored relative URL back into {linkType, target} so editing an
 * existing item shows the right picker instead of falling back to "Custom". */
function parseUrl(url) {
  if (!url || url === "/") return { linkType: "home", target: undefined };
  const collectionMatch = url.match(/^\/collections\/(.+)$/);
  if (collectionMatch) return { linkType: "collection", target: collectionMatch[1] };
  const productMatch = url.match(/^\/products\/(.+)$/);
  if (productMatch) return { linkType: "product", target: productMatch[1] };
  const pageMatch = url.match(/^\/pages\/(.+)$/);
  if (pageMatch) return { linkType: "page", target: pageMatch[1] };
  return { linkType: "custom", target: url };
}

function buildUrl(linkType, target) {
  if (linkType === "home") return "/";
  if (linkType === "collection") return `/collections/${target}`;
  if (linkType === "product") return `/products/${target}`;
  if (linkType === "page") return `/pages/${target}`;
  return target || "";
}

let seq = 0;
const newKey = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Keeps the tree valid: the first link is top level, and no link is more
 * than one level deeper than the link above it. */
function normalize(items) {
  let prev = -1;
  return items.map((it) => {
    const depth = Math.max(0, Math.min(it.depth, prev + 1, MAX_DEPTH));
    prev = depth;
    return depth === it.depth ? it : { ...it, depth };
  });
}

/** The index just past `index`'s sub-links. */
function blockEnd(items, index) {
  let end = index + 1;
  while (end < items.length && items[end].depth > items[index].depth) end += 1;
  return end;
}

function MenuItemRow({ item, index, items, depth, collections, products, pages, onChange, onRemove, onIndent, onOutdent, onAddChild, dragging, hasChildren }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
  // Rows move up and down only; sideways drag sets the depth (see onDragMove).
  const style = { transform: CSS.Transform.toString(transform && { ...transform, x: 0 }), transition, marginLeft: depth * INDENT };
  const canIndent = index > 0 && item.depth < Math.min(items[index - 1].depth + 1, MAX_DEPTH);
  const canOutdent = item.depth > 0;
  const missing = !item.label?.trim();

  const targetField =
    item.linkType === "collection" ? (
      <Select size="small" className="w-full" value={item.target} onChange={(target) => onChange({ target })} placeholder="Choose a collection" showSearch optionFilterProp="label" options={collections.map((c) => ({ value: c.slug, label: c.title }))} />
    ) : item.linkType === "product" ? (
      <Select size="small" className="w-full" value={item.target} onChange={(target) => onChange({ target })} placeholder="Choose a product" showSearch optionFilterProp="label" options={products.map((p) => ({ value: p.slug, label: p.title }))} />
    ) : item.linkType === "page" ? (
      <Select size="small" className="w-full" value={item.target} onChange={(target) => onChange({ target })} placeholder="Choose a page" showSearch optionFilterProp="label" options={pages.map((p) => ({ value: p.slug, label: p.title }))} />
    ) : item.linkType === "custom" ? (
      <Input size="small" value={item.target} onChange={(e) => onChange({ target: e.target.value })} placeholder="/collections/all or https://…" />
    ) : (
      <span className="text-[12px] text-ink-muted px-1">Your home page</span>
    );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-[10px] border bg-app-surface transition-shadow ${isDragging ? "shadow-raised z-10 border-accent" : "border-app-border"} ${dragging && !isDragging ? "opacity-90" : ""}`}
    >
      {depth > 0 && <CornerDownRight size={14} className="absolute -left-[22px] top-[13px] text-ink-subtle" aria-hidden="true" />}
      <div className="flex items-start gap-1.5 p-2">
        <button type="button" className="cursor-grab active:cursor-grabbing text-ink-subtle hover:text-ink p-1 mt-0.5 bg-transparent border-0 touch-none" aria-label={`Move ${item.label || "link"}`} {...attributes} {...listeners}>
          <GripVertical size={15} aria-hidden="true" />
        </button>
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2">
          <Input size="small" value={item.label} status={missing ? "error" : undefined} onChange={(e) => onChange({ label: e.target.value })} placeholder={depth ? "Sub-link name" : "Link name, e.g. Shop"} aria-label="Link name" />
          <Select size="small" value={item.linkType} onChange={(linkType) => onChange({ linkType, target: undefined })} options={LINK_TYPES} aria-label="Links to" />
          {targetField}
        </div>
        <div className="flex items-center shrink-0">
          <Tooltip title="Move left (out of the dropdown)">
            <Button size="small" type="text" disabled={!canOutdent} icon={<IndentDecrease size={14} aria-hidden="true" />} aria-label="Move left" onClick={onOutdent} />
          </Tooltip>
          <Tooltip title="Move right (into the dropdown of the link above)">
            <Button size="small" type="text" disabled={!canIndent} icon={<IndentIncrease size={14} aria-hidden="true" />} aria-label="Move right" onClick={onIndent} />
          </Tooltip>
          {item.depth < MAX_DEPTH && (
            <Tooltip title="Add a sub-link under this one">
              <Button size="small" type="text" icon={<Plus size={14} aria-hidden="true" />} aria-label="Add sub-link" onClick={onAddChild} />
            </Tooltip>
          )}
          <Tooltip title={hasChildren ? "Delete with its sub-links" : "Delete"}>
            <Button size="small" type="text" danger icon={<Trash2 size={14} aria-hidden="true" />} aria-label="Delete link" onClick={onRemove} />
          </Tooltip>
        </div>
      </div>
      {hasChildren && (
        <span className="absolute right-2 -bottom-2 text-[10.5px] leading-none px-1.5 py-[3px] rounded-full bg-accent-soft text-accent inline-flex items-center gap-0.5">
          <ChevronDown size={10} aria-hidden="true" /> dropdown
        </span>
      )}
    </div>
  );
}

export function MenuForm({ menu }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [collections, setCollections] = useState([]);
  const [products, setProducts] = useState([]);
  const [pages, setPages] = useState([]);
  const [items, setItems] = useState(() =>
    normalize((menu?.items || []).map((item) => ({ key: item.id || newKey(), label: item.label, depth: item.depth || 0, ...parseUrl(item.url) })))
  );
  const [drag, setDrag] = useState(null); // { id, offset, overId }
  const isEdit = Boolean(menu);

  useEffect(() => {
    apiFetch("/api/collections?pageSize=100").then((d) => setCollections(d.collections));
    apiFetch("/api/products?pageSize=100").then((d) => setProducts(d.products));
    apiFetch("/api/pages?pageSize=100").then((d) => setPages(d.pages));
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function commit(next) {
    setItems(normalize(next));
    setDirty(true);
  }

  // While a link is dragged its sub-links travel with it, hidden.
  const visible = useMemo(() => {
    if (!drag) return items;
    const i = items.findIndex((x) => x.key === drag.id);
    return i < 0 ? items : [...items.slice(0, i + 1), ...items.slice(blockEnd(items, i))];
  }, [items, drag]);

  /** Where the dragged link would land: its new depth from how far right
   * or left it has been pulled, within what the links around it allow. */
  const projection = useMemo(() => {
    if (!drag) return null;
    const activeIndex = visible.findIndex((x) => x.key === drag.id);
    const overIndex = drag.overId ? visible.findIndex((x) => x.key === drag.overId) : activeIndex;
    if (activeIndex < 0 || overIndex < 0) return null;
    const moved = arrayMove(visible, activeIndex, overIndex);
    const active = visible[activeIndex];
    const fullIndex = items.findIndex((x) => x.key === drag.id);
    const sub = items.slice(fullIndex + 1, blockEnd(items, fullIndex));
    const height = sub.reduce((h, s) => Math.max(h, s.depth - active.depth), 0);
    const prev = moved[overIndex - 1];
    const next = moved[overIndex + 1];
    const max = Math.min(prev ? prev.depth + 1 : 0, MAX_DEPTH - height);
    const min = next ? Math.min(next.depth, max) : 0;
    const wanted = active.depth + Math.round(drag.offset / INDENT);
    return { depth: Math.max(min, Math.min(wanted, max)), overIndex, moved };
  }, [drag, visible, items]);

  function onDragEnd() {
    const p = projection;
    const id = drag?.id;
    setDrag(null);
    if (!p || !id) return;
    const from = items.findIndex((x) => x.key === id);
    const block = items.slice(from, blockEnd(items, from));
    const shift = p.depth - block[0].depth;
    const rest = [...items.slice(0, from), ...items.slice(from + block.length)];
    const after = p.moved[p.overIndex + 1];
    const at = after ? rest.findIndex((x) => x.key === after.key) : rest.length;
    const placed = block.map((b) => ({ ...b, depth: b.depth + shift }));
    const next = [...rest.slice(0, at), ...placed, ...rest.slice(at)];
    if (next.some((x, i) => x.key !== items[i]?.key || x.depth !== items[i]?.depth)) commit(next);
  }

  const update = (key, patch) => commit(items.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  function shiftBlock(index, by) {
    const end = blockEnd(items, index);
    commit(items.map((x, i) => (i >= index && i < end ? { ...x, depth: x.depth + by } : x)));
  }

  function remove(index) {
    commit([...items.slice(0, index), ...items.slice(blockEnd(items, index))]);
  }

  function addChild(index) {
    const end = blockEnd(items, index);
    commit([...items.slice(0, end), { key: newKey(), label: "", linkType: "collection", depth: items[index].depth + 1 }, ...items.slice(end)]);
  }

  async function handleSubmit(values) {
    if (items.some((x) => !x.label?.trim())) {
      message.error("Give every link a name.");
      return;
    }
    const missingTarget = items.find((x) => x.linkType !== "home" && !String(x.target || "").trim());
    if (missingTarget) {
      message.error(`Choose where “${missingTarget.label}” links to.`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        handle: values.handle,
        title: values.title,
        items: items.map((item) => ({ label: item.label.trim(), url: buildUrl(item.linkType, String(item.target || "").trim()), depth: item.depth })),
      };
      if (isEdit) {
        await apiFetch(`/api/menus/${menu.id}`, { method: "PATCH", body: { title: payload.title, items: payload.items } });
      } else {
        await apiFetch("/api/menus", { method: "POST", body: payload });
      }
      setDirty(false);
      router.push("/admin/content/navigation");
      router.refresh();
    } catch (err) {
      message.error(err.message || "Couldn't save the menu");
    } finally {
      setSaving(false);
    }
  }

  const draggedDepth = (item) => (drag && item.key === drag.id && projection ? projection.depth : item.depth);

  return (
    <div>
      <PageHeader title={isEdit ? menu.title : "Add menu"} backHref="/admin/content/navigation" />

      <Form
        form={form}
        layout="vertical"
        initialValues={menu ? { handle: menu.handle, title: menu.title } : { handle: "main-menu", title: "Main menu" }}
        onFinish={handleSubmit}
        onValuesChange={() => setDirty(true)}
        requiredMark={false}
      >
        <div className="max-w-4xl flex flex-col gap-6">
          <Card size="small" title="Menu">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Form.Item name="title" label="Title" rules={[{ required: true, message: "Title is required" }]}>
                <Input placeholder="Main menu" />
              </Form.Item>
              <Form.Item name="handle" label="Shown in">
                <Select options={HANDLE_OPTIONS} disabled={isEdit} />
              </Form.Item>
            </div>
          </Card>

          <Card size="small" title="Links">
            <p className="text-[13px] text-ink-muted mt-0 mb-4">
              Drag <GripVertical size={12} className="inline -mt-0.5" aria-hidden="true" /> up or down to reorder. Drag a link to the <b>right</b> to tuck it under the link above — that link becomes a dropdown. Drag it back to the <b>left</b> to take it out. Or use the arrow buttons.
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={({ active }) => setDrag({ id: active.id, offset: 0, overId: active.id })}
              onDragMove={({ delta, over }) => setDrag((d) => (d ? { ...d, offset: delta.x, overId: over?.id ?? d.overId } : d))}
              onDragOver={({ over }) => setDrag((d) => (d ? { ...d, overId: over?.id ?? d.overId } : d))}
              onDragEnd={onDragEnd}
              onDragCancel={() => setDrag(null)}
            >
              <SortableContext items={visible.map((x) => x.key)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2.5 pl-1">
                  {visible.map((item) => {
                    const index = items.findIndex((x) => x.key === item.key);
                    return (
                      <MenuItemRow
                        key={item.key}
                        item={item}
                        index={index}
                        items={items}
                        depth={draggedDepth(item)}
                        dragging={Boolean(drag)}
                        hasChildren={blockEnd(items, index) > index + 1}
                        collections={collections}
                        products={products}
                        pages={pages}
                        onChange={(patch) => update(item.key, patch)}
                        onRemove={() => remove(index)}
                        onIndent={() => shiftBlock(index, 1)}
                        onOutdent={() => shiftBlock(index, -1)}
                        onAddChild={() => addChild(index)}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
            {items.length === 0 && <p className="text-[13px] text-ink-muted text-center py-4 m-0">No links yet — your store shows a simple default menu until you add some.</p>}
            <Button type="dashed" className="mt-3" icon={<Plus size={14} aria-hidden="true" />} onClick={() => commit([...items, { key: newKey(), label: "", linkType: "collection", depth: 0 }])}>
              Add link
            </Button>
          </Card>
        </div>

        <SaveBar dirty={dirty} isNew={!isEdit} saving={saving} saveLabel={isEdit ? "Save" : "Add menu"} onDiscard={() => router.push("/admin/content/navigation")} />
      </Form>
    </div>
  );
}
