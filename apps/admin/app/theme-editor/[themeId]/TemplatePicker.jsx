"use client";

import { useState } from "react";
import { App, Button, Dropdown, Form, Input, Modal, Select } from "antd";
import { Plus, MoreHorizontal, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

const KIND_LABEL = { product: "Product", page: "Page", collection: "Collection" };
const KIND_PLURAL = { product: "products", page: "pages", collection: "collections" };

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
export function CreateTemplateModal({ open, onClose, themeId, templates, defaultKind, onCreated }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const kind = Form.useWatch("kind", form) || defaultKind;

  async function submit(values) {
    setSaving(true);
    try {
      const { template } = await apiFetch(`/api/themes/${themeId}/templates`, { method: "POST", body: { ...values, basedOn: values.basedOn || null } });
      message.success(`“${template.label}” template created — arrange it, then choose it on any ${values.kind}.`);
      form.resetFields();
      onCreated(template);
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
            onChange={() => form.setFieldValue("basedOn", "")}
          />
        </Form.Item>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name the template" }]} extra="Only you see this — e.g. Rental, Size guide, Bridal.">
          <Input maxLength={40} placeholder="e.g. Rental" autoFocus />
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
