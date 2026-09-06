"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Select, Button, Card } from "antd";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@shopcycle/ui";
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

function MenuItemRow({ field, restField, form, collections, products, pages, onRemove }) {
  const linkType = Form.useWatch(["items", field.name, "linkType"], form);

  return (
    <div className="border border-app-border rounded-md p-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Form.Item {...restField} name={[field.name, "label"]} label="Label" className="mb-0" rules={[{ required: true, message: "Required" }]}>
          <Input placeholder="Shop" />
        </Form.Item>
        <Form.Item {...restField} name={[field.name, "linkType"]} label="Links to" className="mb-0">
          <Select options={LINK_TYPES} />
        </Form.Item>
        {linkType === "collection" && (
          <Form.Item {...restField} name={[field.name, "target"]} label="Collection" className="mb-0">
            <Select options={collections.map((c) => ({ value: c.slug, label: c.title }))} />
          </Form.Item>
        )}
        {linkType === "product" && (
          <Form.Item {...restField} name={[field.name, "target"]} label="Product" className="mb-0">
            <Select options={products.map((p) => ({ value: p.slug, label: p.title }))} />
          </Form.Item>
        )}
        {linkType === "page" && (
          <Form.Item {...restField} name={[field.name, "target"]} label="Page" className="mb-0">
            <Select options={pages.map((p) => ({ value: p.slug, label: p.title }))} />
          </Form.Item>
        )}
        {linkType === "custom" && (
          <Form.Item {...restField} name={[field.name, "target"]} label="URL" className="mb-0">
            <Input placeholder="/collections/all" />
          </Form.Item>
        )}
      </div>
      <Button type="text" danger size="small" className="mt-2" icon={<Trash2 size={14} aria-hidden="true" />} onClick={onRemove}>
        Remove item
      </Button>
    </div>
  );
}

export function MenuForm({ menu }) {
  const router = useRouter();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [collections, setCollections] = useState([]);
  const [products, setProducts] = useState([]);
  const [pages, setPages] = useState([]);
  const isEdit = Boolean(menu);

  useEffect(() => {
    apiFetch("/api/collections?pageSize=100").then((d) => setCollections(d.collections));
    apiFetch("/api/products?pageSize=100").then((d) => setProducts(d.products));
    apiFetch("/api/pages?pageSize=100").then((d) => setPages(d.pages));
  }, []);

  const initialValues = menu
    ? {
        handle: menu.handle,
        title: menu.title,
        items: menu.items.map((item) => ({ label: item.label, ...parseUrl(item.url) })),
      }
    : { handle: "main-menu", title: "Main menu", items: [] };

  async function handleSubmit(values) {
    setSaving(true);
    try {
      const payload = {
        handle: values.handle,
        title: values.title,
        items: (values.items || []).map((item) => ({ label: item.label, url: buildUrl(item.linkType, item.target) })),
      };
      if (isEdit) {
        await apiFetch(`/api/menus/${menu.id}`, { method: "PATCH", body: { title: payload.title, items: payload.items } });
      } else {
        await apiFetch("/api/menus", { method: "POST", body: payload });
      }
      router.push("/admin/content/navigation");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title={isEdit ? menu.title : "Add menu"} breadcrumb={<a href="/admin/content/navigation">Navigation</a>} />

      <Form form={form} layout="vertical" initialValues={initialValues} onFinish={handleSubmit} requiredMark={false}>
        <div className="max-w-3xl flex flex-col gap-6">
          <Card size="small" title="Menu">
            <Form.Item name="title" label="Title" rules={[{ required: true, message: "Title is required" }]}>
              <Input placeholder="Main menu" />
            </Form.Item>
            <Form.Item name="handle" label="Handle" className="mb-0">
              <Select options={HANDLE_OPTIONS} disabled={isEdit} />
            </Form.Item>
          </Card>

          <Card size="small" title="Menu items">
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <div className="flex flex-col gap-3">
                  {fields.map((field) => (
                    <MenuItemRow
                      key={field.key}
                      field={field}
                      restField={field}
                      form={form}
                      collections={collections}
                      products={products}
                      pages={pages}
                      onRemove={() => remove(field.name)}
                    />
                  ))}
                  <Button
                    type="dashed"
                    icon={<Plus size={14} aria-hidden="true" />}
                    onClick={() => add({ label: "", linkType: "collection" })}
                  >
                    Add menu item
                  </Button>
                </div>
              )}
            </Form.List>
          </Card>
        </div>

        <div className="sticky bottom-0 -mx-6 mt-6 bg-app-surface border-t border-app-border px-6 py-3 flex justify-end gap-2 max-w-3xl">
          <Button onClick={() => router.push("/admin/content/navigation")}>Discard</Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            {isEdit ? "Save" : "Add menu"}
          </Button>
        </div>
      </Form>
    </div>
  );
}
