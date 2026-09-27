"use client";

import { useState } from "react";
import { Card, Button, Modal, Input, Select, Switch, App, Tabs, Tooltip, Alert } from "antd";
import {
  Type,
  AlignLeft,
  Hash,
  ToggleLeft,
  CalendarDays,
  Link2,
  Palette,
  Image as ImageIcon,
  List,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { EmptyState, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const TYPE_ICON = {
  text: Type,
  multiline: AlignLeft,
  number: Hash,
  boolean: ToggleLeft,
  date: CalendarDays,
  url: Link2,
  color: Palette,
  image: ImageIcon,
  list: List,
};

/** One-click starting points, by the kind of shop. */
const SUGGESTIONS = {
  product: [
    { group: "Clothing", name: "Fabric", type: "text" },
    { group: "Clothing", name: "Fit", type: "text", choices: ["Slim", "Regular", "Relaxed", "Oversized"] },
    { group: "Clothing", name: "Care instructions", type: "multiline" },
    { group: "Clothing", name: "Size chart", type: "image" },
    { group: "Clothing", name: "Occasion", type: "list" },
    { group: "Jewellery", name: "Metal", type: "text", choices: ["Gold", "Silver", "Rose gold", "Platinum", "Brass"] },
    { group: "Jewellery", name: "Purity", type: "text", choices: ["24K", "22K", "18K", "14K", "925 Sterling"] },
    { group: "Jewellery", name: "Stone", type: "text" },
    { group: "Jewellery", name: "Weight (g)", type: "number" },
    { group: "Jewellery", name: "Certified", type: "boolean" },
    { group: "Any shop", name: "Country of origin", type: "text" },
    { group: "Any shop", name: "Handmade", type: "boolean" },
    { group: "Any shop", name: "Shelf life", type: "text" },
    { group: "Any shop", name: "Ingredients", type: "multiline" },
  ],
  collection: [
    { group: "Any shop", name: "Banner text", type: "text" },
    { group: "Any shop", name: "Lookbook link", type: "url" },
    { group: "Any shop", name: "Theme colour", type: "color" },
  ],
};

const keyFrom = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

function FieldModal({ open, ownerType, types, editing, onClose, onSaved }) {
  const { message } = App.useApp();
  const [name, setName] = useState(editing?.name || "");
  const [type, setType] = useState(editing?.type || "text");
  const [description, setDescription] = useState(editing?.description || "");
  const [choices, setChoices] = useState(editing?.choices || []);
  const [show, setShow] = useState(editing ? editing.showOnStorefront : true);
  const [saving, setSaving] = useState(false);
  const key = editing?.key || keyFrom(name);

  async function save() {
    setSaving(true);
    try {
      const body = { name, description, choices, showOnStorefront: show };
      const { definition } = editing
        ? await apiFetch(`/api/metafields/${editing.id}`, { method: "PATCH", body })
        : await apiFetch("/api/metafields", { method: "POST", body: { ...body, ownerType, type } });
      onSaved(definition, Boolean(editing));
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={editing ? `Edit “${editing.name}”` : "Add a field"}
      okText={editing ? "Save" : "Add field"}
      onOk={save}
      confirmLoading={saving}
      okButtonProps={{ disabled: !name.trim() }}
      width={600}
      destroyOnHidden
    >
      <div className="flex flex-col gap-4 mt-3">
        <label className="block">
          <span className="block text-[13px] font-medium text-ink mb-1">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fabric" maxLength={60} autoFocus />
          {key && (
            <span className="block text-xs text-ink-muted mt-1">
              In themes: <code>{`{{ ${ownerType}.metafields.custom.${key} }}`}</code>
            </span>
          )}
        </label>

        <div>
          <span className="block text-[13px] font-medium text-ink mb-1.5">Type{editing ? " (can't be changed)" : ""}</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Field type">
            {types.map((t) => {
              const Icon = TYPE_ICON[t.key] || Type;
              const active = type === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={Boolean(editing) && !active}
                  onClick={() => setType(t.key)}
                  className={`text-left rounded-lg border px-3 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    active ? "border-accent bg-accent-soft" : "border-app-border bg-app-surface hover:bg-app-bg"
                  }`}
                >
                  <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    <Icon size={14} aria-hidden="true" /> {t.label}
                  </span>
                  <span className="block text-[11px] text-ink-muted mt-0.5 leading-snug">{t.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        {type === "text" && (
          <label className="block">
            <span className="block text-[13px] font-medium text-ink mb-1">Preset choices (optional)</span>
            <Select mode="tags" value={choices} onChange={setChoices} tokenSeparators={[","]} placeholder="e.g. Slim, Regular, Relaxed" open={false} suffixIcon={null} className="w-full" />
            <span className="block text-xs text-ink-muted mt-1">With choices, the product form shows a dropdown instead of a text box.</span>
          </label>
        )}

        <label className="block">
          <span className="block text-[13px] font-medium text-ink mb-1">Help text (optional)</span>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown under the field on the product form" maxLength={300} />
        </label>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-app-border px-3 py-2.5">
          <span>
            <span className="block text-[13px] font-medium text-ink">Show on the {ownerType === "product" ? "product" : "collection"} page</span>
            <span className="block text-xs text-ink-muted">Listed under “Details”. Turn off for internal notes.</span>
          </span>
          <Switch checked={show} onChange={setShow} />
        </label>
      </div>
    </Modal>
  );
}

function DefinitionList({ ownerType, types, defs, setDefs, canEdit }) {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [modal, setModal] = useState(null); // null | { editing }
  const typeLabel = Object.fromEntries(types.map((t) => [t.key, t.label]));
  const existing = new Set(defs.map((d) => d.key));
  const suggestions = SUGGESTIONS[ownerType].filter((s) => !existing.has(keyFrom(s.name)));

  async function addSuggestion(s) {
    try {
      const { definition } = await apiFetch("/api/metafields", { method: "POST", body: { ownerType, name: s.name, type: s.type, choices: s.choices } });
      setDefs((l) => [...l, definition]);
      message.success(`Added “${s.name}”`);
    } catch (err) {
      message.error(err.message);
    }
  }

  async function move(index, dir) {
    const next = [...defs];
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    setDefs(next);
    try {
      await apiFetch("/api/metafields/order", { method: "PUT", body: { ownerType, ids: next.map((d) => d.id) } });
    } catch (err) {
      message.error(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        size="small"
        title={`${ownerType === "product" ? "Product" : "Collection"} fields`}
        extra={
          canEdit && (
            <Button size="small" type="primary" icon={<Plus size={13} aria-hidden="true" />} onClick={() => setModal({ editing: null })}>
              Add field
            </Button>
          )
        }
      >
        {defs.length === 0 ? (
          <EmptyState
            icon={<Sparkles />}
            title="No fields yet"
            description={`Add a field and it appears on every ${ownerType}'s edit page, ready to fill in.`}
          />
        ) : (
          <ul className="m-0 p-0 list-none divide-y divide-app-border">
            {defs.map((d, i) => {
              const Icon = TYPE_ICON[d.type] || Type;
              return (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-8 h-8 rounded-md bg-app-bg border border-app-border flex items-center justify-center shrink-0 text-ink-muted">
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm font-medium text-ink truncate">{d.name}</p>
                    <p className="m-0 text-xs text-ink-muted truncate">
                      {typeLabel[d.type]}
                      {d.choices?.length ? ` · ${d.choices.length} choices` : ""} · <code className="text-[11px]">custom.{d.key}</code>
                    </p>
                  </div>
                  <Tooltip title={d.showOnStorefront ? "Shown on the store" : "Hidden from shoppers"}>
                    <span className="text-ink-subtle" aria-label={d.showOnStorefront ? "Shown on the store" : "Hidden from shoppers"}>
                      {d.showOnStorefront ? <Eye size={15} aria-hidden="true" /> : <EyeOff size={15} aria-hidden="true" />}
                    </span>
                  </Tooltip>
                  {canEdit && (
                    <div className="flex items-center">
                      <Button size="small" type="text" icon={<ArrowUp size={13} aria-hidden="true" />} aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
                      <Button size="small" type="text" icon={<ArrowDown size={13} aria-hidden="true" />} aria-label="Move down" disabled={i === defs.length - 1} onClick={() => move(i, 1)} />
                      <Button size="small" type="text" icon={<Pencil size={13} aria-hidden="true" />} aria-label={`Edit ${d.name}`} onClick={() => setModal({ editing: d })} />
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<Trash2 size={13} aria-hidden="true" />}
                        aria-label={`Delete ${d.name}`}
                        onClick={() =>
                          confirmDialog({
                            title: `Delete “${d.name}”?`,
                            description: `The field and every value saved in it are removed from all ${ownerType}s. This can't be undone.`,
                            okText: "Delete field",
                            danger: true,
                            onConfirm: async () => {
                              await apiFetch(`/api/metafields/${d.id}`, { method: "DELETE" });
                              setDefs((l) => l.filter((x) => x.id !== d.id));
                            },
                          })
                        }
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {canEdit && suggestions.length > 0 && (
        <Card size="small" title="Quick add">
          <div className="flex flex-col gap-3">
            {Object.entries(
              suggestions.reduce((acc, s) => ((acc[s.group] ||= []).push(s), acc), {})
            ).map(([group, items]) => (
              <div key={group}>
                <p className="m-0 mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-subtle">{group}</p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((s) => {
                    const Icon = TYPE_ICON[s.type] || Type;
                    return (
                      <Button key={s.name} size="small" icon={<Icon size={12} aria-hidden="true" />} onClick={() => addSuggestion(s)}>
                        {s.name}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {modal && (
        <FieldModal
          open
          ownerType={ownerType}
          types={types}
          editing={modal.editing}
          onClose={() => setModal(null)}
          onSaved={(def, wasEdit) => setDefs((l) => (wasEdit ? l.map((x) => (x.id === def.id ? def : x)) : [...l, def]))}
        />
      )}
    </div>
  );
}

export function CustomDataSettings({ types, initial, canEdit }) {
  const [product, setProduct] = useState(initial.product);
  const [collection, setCollection] = useState(initial.collection);
  return (
    <div className="max-w-3xl flex flex-col gap-4">
      {!canEdit && <Alert type="info" showIcon message="Only the store owner or an admin can add or change fields. You can still fill them in on each product." />}
      <Tabs
        items={[
          { key: "product", label: `Products (${product.length})`, children: <DefinitionList ownerType="product" types={types} defs={product} setDefs={setProduct} canEdit={canEdit} /> },
          { key: "collection", label: `Collections (${collection.length})`, children: <DefinitionList ownerType="collection" types={types} defs={collection} setDefs={setCollection} canEdit={canEdit} /> },
        ]}
      />
    </div>
  );
}
