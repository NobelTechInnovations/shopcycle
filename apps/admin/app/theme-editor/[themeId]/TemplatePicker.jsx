"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Checkbox, Dropdown, Form, Input, Modal, Select } from "antd";
import { Plus, MoreHorizontal, Trash2, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";

const KIND_LABEL = { product: "Product", page: "Page", collection: "Collection" };
const KIND_PLURAL = { product: "products", page: "pages", collection: "collections" };

/** The layout an item really uses on the store: its own template when that
 * exists, the Rental layout for a rented product, else the default — the
 * same choice the storefront makes. */
export function effectiveTemplate(templates, kind, item) {
  if (!item) return kind;
  const has = (s) => (templates[kind] || []).some((t) => t.suffix === s);
  if (item.templateSuffix && has(item.templateSuffix)) return `${kind}.${item.templateSuffix}`;
  if (kind === "product" && item.rental?.enabled && has("rental")) return "product.rental";
  return kind;
}

/** "Default" or the extra template's name. */
export const layoutName = (templates, name) => templateLabel(templates, name) || "Default";

/** The template a page (About us, Contact…) is shown with. */
export function pageTemplate(templates, page) {
  const suffix = page?.templateSuffix;
  return suffix && (templates.page || []).some((t) => t.suffix === suffix) ? `page.${suffix}` : "page";
}

/** The page being edited: home, each kind's default and extra templates,
 * the store's own pages (each opens the template it uses, previewing it),
 * and fixed pages shown as previews. A page's option value is
 * "page@<slug>". */
export function templateOptions(templates, pages = []) {
  const group = (kind, defaultLabel) => ({
    label: `${KIND_LABEL[kind]} templates`,
    options: [
      { value: kind, label: defaultLabel },
      ...(templates[kind] || []).map((t) => ({ value: t.name, label: `${KIND_LABEL[kind]} · ${t.label}` })),
    ],
  });
  const own = pages.length
    ? [
        {
          label: "Your pages",
          options: pages.map((p) => {
            const t = pageTemplate(templates, p);
            return { value: `page@${p.slug}`, label: `${p.title}${t === "page" ? "" : ` · ${templateLabel(templates, t)}`}` };
          }),
        },
      ]
    : [];
  return [
    { label: "Home", options: [{ value: "index", label: "Home page" }] },
    group("product", "Default product"),
    group("collection", "Default collection"),
    group("page", "Default page"),
    ...own,
    { label: "Other pages", options: [{ value: "contact", label: "Contact page" }] },
    { label: "Previews", options: [{ value: "cart", label: "Cart · preview" }] },
  ];
}

export function templateLabel(templates, name) {
  const [kind, suffix] = String(name).split(".");
  if (!suffix) return null;
  return (templates[kind] || []).find((t) => t.suffix === suffix)?.label || suffix;
}

/**
 * "Create template": a named copy of a product, page or collection layout
 * (Shopify's alternate templates). Products/pages/collections then pick it
 * on their own page in the admin.
 */
export function CreateTemplateModal({ open, onClose, themeId, templates, defaultKind, onCreated, items = {} }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const kind = Form.useWatch("kind", form) || defaultKind;

  async function submit(values) {
    setSaving(true);
    try {
      const { template } = await apiFetch(`/api/themes/${themeId}/templates`, { method: "POST", body: { ...values, basedOn: values.basedOn || null, assign: values.assign || [] } });
      const n = values.assign?.length || 0;
      message.success(n ? `“${template.label}” layout created and used by ${n} ${n === 1 ? values.kind : KIND_PLURAL[values.kind]} — arrange it now.` : `“${template.label}” layout created — arrange it, then choose where it's used.`);
      form.resetFields();
      onCreated(template, values.assign || []);
    } catch (err) {
      message.error(err.message || "Couldn't create the template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Create a template"
      okText="Create template"
      confirmLoading={saving}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <p className="text-[13px] text-ink-muted mt-0">
        A second layout for some of your {KIND_PLURAL[kind] || "pages"} — for example a “Rental” product page without the usual price and add-to-cart, or a
        “Bridal” collection with a banner on top. Pick it on each item&apos;s page in the admin, under <strong>Theme template</strong>.
      </p>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ kind: defaultKind, basedOn: "" }} onFinish={submit}>
        <Form.Item name="kind" label="Template for">
          <Select
            options={[
              { value: "product", label: "Products" },
              { value: "collection", label: "Collections" },
              { value: "page", label: "Pages" },
            ]}
            onChange={() => {
              form.setFieldValue("basedOn", "");
              form.setFieldValue("assign", []);
            }}
          />
        </Form.Item>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name the template" }]} extra="Only you see this — e.g. Rental, Size guide, Bridal.">
          <Input maxLength={40} placeholder="e.g. Rental" autoFocus />
        </Form.Item>
        <Form.Item name="assign" label={`Use it for`} extra={`Choose ${KIND_PLURAL[kind] || "items"} now, or later from “Used by” in the editor.`}>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={`Pick ${KIND_PLURAL[kind] || "items"}`}
            options={(items[kind] || []).map((x) => ({ value: x.id, label: x.title }))}
          />
        </Form.Item>
        <Form.Item name="basedOn" label="Start from">
          <Select
            options={[
              { value: "", label: `Default ${KIND_LABEL[kind]?.toLowerCase() || ""} layout` },
              ...((templates[kind] || []).map((t) => ({ value: t.suffix, label: t.label }))),
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** "…" next to an extra template: delete it. */
export function TemplateActions({ themeId, name, label, usage, onDeleted }) {
  const { modal, message } = App.useApp();
  const used = usage?.[name] || 0;
  const kind = String(name).split(".")[0];

  function confirmDelete() {
    modal.confirm({
      title: `Delete the “${label}” template?`,
      content: used
        ? `${used} ${used === 1 ? kind : KIND_PLURAL[kind]} use${used === 1 ? "s" : ""} it — they'll go back to the default layout.`
        : "Nothing uses it yet.",
      okText: "Delete template",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await apiFetch(`/api/themes/${themeId}/templates/${encodeURIComponent(name)}`, { method: "DELETE" });
          message.success("Template deleted");
          onDeleted(name);
        } catch (err) {
          message.error(err.message || "Couldn't delete the template");
        }
      },
    });
  }

  return (
    <Dropdown
      trigger={["click"]}
      menu={{ items: [{ key: "delete", danger: true, icon: <Trash2 size={14} aria-hidden="true" />, label: "Delete template", onClick: confirmDelete }] }}
    >
      <Button size="small" icon={<MoreHorizontal size={14} aria-hidden="true" />} aria-label="Template actions" />
    </Dropdown>
  );
}

export function NewTemplateButton({ onClick }) {
  return (
    <Button size="small" icon={<Plus size={14} aria-hidden="true" />} onClick={onClick} className="hidden md:inline-flex">
      Template
    </Button>
  );
}

/**
 * "Used by": which products / pages / collections use this layout. Ticking
 * one moves it onto this layout; unticking moves it back to the default.
 * The default layout itself can only gain items (to leave it, an item
 * picks another layout).
 */
export function AssignTemplateModal({ open, onClose, kind, name, templates, items, onAssigned }) {
  const { message } = App.useApp();
  const [chosen, setChosen] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const isDefault = name === kind;
  const label = layoutName(templates, name);
  const using = useMemo(() => new Set(items.filter((x) => effectiveTemplate(templates, kind, x) === name).map((x) => x.id)), [items, templates, kind, name]);

  useEffect(() => {
    if (open) {
      setChosen(new Set(using));
      setQ("");
    }
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shown = items.filter((x) => !q || x.title.toLowerCase().includes(q.toLowerCase()));

  async function save() {
    setSaving(true);
    try {
      const ids = isDefault ? [...chosen].filter((id) => !using.has(id)) : [...chosen];
      const { usage } = await apiFetch("/api/themes/templates/assign", { method: "POST", body: { kind, name, ids } });
      message.success(`Saved — the store shows the “${label}” layout on them now`);
      onAssigned({ kind, name, ids, usage });
    } catch (err) {
      message.error(err.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onCancel={onClose} title={`Where the “${label}” ${kind} layout is used`} okText="Save" confirmLoading={saving} onOk={save} destroyOnHidden>
      <p className="text-[13px] text-ink-muted mt-0">
        {isDefault
          ? `Tick ${KIND_PLURAL[kind]} to move them back to the default layout.`
          : `Tick the ${KIND_PLURAL[kind]} that should look like this. Unticked ones use the default layout.`}
      </p>
      {items.length > 8 && (
        <Input className="mb-3" allowClear prefix={<Search size={14} aria-hidden="true" />} placeholder={`Search ${KIND_PLURAL[kind]}`} value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      <div className="max-h-[50vh] overflow-y-auto flex flex-col gap-1.5 pr-1">
        {shown.length === 0 && <p className="text-[13px] text-ink-muted m-0">Nothing here yet.</p>}
        {shown.map((x) => {
          const current = effectiveTemplate(templates, kind, x);
          const locked = isDefault && using.has(x.id);
          return (
            <Checkbox
              key={x.id}
              checked={chosen.has(x.id)}
              disabled={locked}
              onChange={(e) =>
                setChosen((cur) => {
                  const next = new Set(cur);
                  if (e.target.checked) next.add(x.id);
                  else next.delete(x.id);
                  return next;
                })
              }
            >
              <span className="text-[13.5px] text-ink">{x.title}</span>
              {current !== name && <span className="text-[12px] text-ink-muted"> · now uses {layoutName(templates, current)}</span>}
            </Checkbox>
          );
        })}
      </div>
    </Modal>
  );
}
