"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, InputNumber, Select, Button, Card, Upload, App } from "antd";
import { Plus, Trash2, UploadCloud } from "lucide-react";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch, apiUpload } from "@/lib/api";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

const MAX_IMAGES = 8;

export function ProductForm({ product }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [images, setImages] = useState(
    product ? product.images.map((img) => ({ uid: img.id, url: img.url })) : []
  );
  const [uploading, setUploading] = useState(false);
  const [form] = Form.useForm();
  const seoTitle = Form.useWatch("seoTitle", form);
  const seoDescription = Form.useWatch("seoDescription", form);
  const title = Form.useWatch("title", form);
  const description = Form.useWatch("description", form);
  const isEdit = Boolean(product);

  const initialValues = product
    ? {
        title: product.title,
        description: product.description,
        status: product.status,
        vendor: product.vendor,
        productType: product.productType,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        variants: product.variants.map((v) => ({
          title: v.title,
          sku: v.sku,
          price: Number(v.price),
          comparePrice: v.comparePrice ? Number(v.comparePrice) : undefined,
          inventoryQuantity: v.inventoryQuantity,
        })),
      }
    : {
        status: "draft",
        variants: [{ title: "Default", price: 0, inventoryQuantity: 0 }],
      };

  async function handleImageUpload(file) {
    setUploading(true);
    try {
      const { file: uploaded } = await apiUpload("/api/files/upload", file);
      setImages((prev) => [...prev, { uid: uploaded.id, url: uploaded.url }]);
    } catch (err) {
      message.error(err.message);
    } finally {
      setUploading(false);
    }
    return false; // stop antd's own XHR upload — we already uploaded via apiUpload
  }

  function removeImage(uid) {
    setImages((prev) => prev.filter((img) => img.uid !== uid));
  }

  async function handleSubmit(values) {
    setSaving(true);
    try {
      const payload = { ...values, images: images.map((img) => ({ url: img.url })) };
      if (isEdit) {
        await apiFetch(`/api/products/${product.id}`, { method: "PATCH", body: payload });
      } else {
        await apiFetch("/api/products", { method: "POST", body: payload });
      }
      router.push("/admin/products");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const previewTitle = seoTitle || title || "Product title";
  const previewDescription = seoDescription || description || "A short description of this product will appear here.";

  return (
    <div>
      <PageHeader
        title={isEdit ? product.title : "Add product"}
        breadcrumb={<a href="/admin/products">Products</a>}
      />

      <Form form={form} layout="vertical" initialValues={initialValues} onFinish={handleSubmit} requiredMark={false}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Card size="small" title="Title & description">
              <Form.Item name="title" label="Title" rules={[{ required: true, message: "Title is required" }]}>
                <Input size="large" placeholder="Short sleeve t-shirt" />
              </Form.Item>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={4} />
              </Form.Item>
            </Card>

            <Card size="small" title="Variants">
              <Form.List name="variants">
                {(fields, { add, remove }) => (
                  <div className="flex flex-col gap-4">
                    {fields.map(({ key, name, ...restField }) => (
                      <div key={key} className="border border-app-border rounded-md p-3">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          <Form.Item {...restField} name={[name, "title"]} label="Title" className="mb-0">
                            <Input placeholder="Default" />
                          </Form.Item>
                          <Form.Item {...restField} name={[name, "sku"]} label="SKU" className="mb-0">
                            <Input />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, "price"]}
                            label="Price"
                            className="mb-0"
                            rules={[{ required: true, message: "Required" }]}
                          >
                            <InputNumber min={0} className="w-full" prefix="₹" />
                          </Form.Item>
                          <Form.Item {...restField} name={[name, "comparePrice"]} label="Compare at" className="mb-0">
                            <InputNumber min={0} className="w-full" prefix="₹" />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, "inventoryQuantity"]}
                            label="Inventory"
                            className="mb-0"
                          >
                            <InputNumber min={0} className="w-full" />
                          </Form.Item>
                        </div>
                        {fields.length > 1 && (
                          <Button
                            type="text"
                            danger
                            size="small"
                            className="mt-2"
                            icon={<Trash2 size={14} aria-hidden="true" />}
                            onClick={() => remove(name)}
                          >
                            Remove variant
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="dashed"
                      icon={<Plus size={14} aria-hidden="true" />}
                      onClick={() => add({ title: "", price: 0, inventoryQuantity: 0 })}
                    >
                      Add variant
                    </Button>
                  </div>
                )}
              </Form.List>
            </Card>

            <Card size="small" title="Images">
              <Upload
                listType="picture-card"
                fileList={images.map((img) => ({ uid: img.uid, url: img.url, status: "done", name: "image" }))}
                beforeUpload={handleImageUpload}
                onRemove={(file) => removeImage(file.uid)}
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              >
                {images.length < MAX_IMAGES && (
                  <div className="flex flex-col items-center text-xs text-ink-muted">
                    <UploadCloud size={18} aria-hidden="true" />
                    <span className="mt-1">{uploading ? "Uploading…" : "Upload"}</span>
                  </div>
                )}
              </Upload>
              <p className="text-xs text-ink-muted mt-2 mb-0">JPEG, PNG, WebP, GIF, or SVG — up to 8MB, {MAX_IMAGES} images.</p>
            </Card>

            <Card size="small" title="SEO">
              <Form.Item name="seoTitle" label="Page title">
                <Input />
              </Form.Item>
              <Form.Item name="seoDescription" label="Meta description" className="mb-0">
                <Input.TextArea rows={2} />
              </Form.Item>

              <div className="mt-4 pt-4 border-t border-app-border">
                <p className="text-xs text-ink-muted mb-2">Search engine preview</p>
                <div className="border border-app-border rounded-md p-3 bg-app-bg">
                  <p className="text-[#1a0dab] text-base m-0 truncate">{previewTitle}</p>
                  <p className="text-[#006621] text-xs m-0">shopcycle.test/products/…</p>
                  <p className="text-sm text-ink-muted mt-1 mb-0 line-clamp-2">{previewDescription}</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card size="small" title="Status">
              <Form.Item name="status" className="mb-0">
                <Select options={STATUS_OPTIONS} />
              </Form.Item>
            </Card>
            <Card size="small" title="Organization">
              <Form.Item name="productType" label="Product type">
                <Input />
              </Form.Item>
              <Form.Item name="vendor" label="Vendor">
                <Input />
              </Form.Item>
            </Card>
          </div>
        </div>

        {/* Sticky action bar, per the "sticky action areas" pattern used across the admin. */}
        <div className="sticky bottom-0 -mx-6 mt-6 bg-app-surface border-t border-app-border px-6 py-3 flex justify-end gap-2">
          <Button onClick={() => router.push("/admin/products")}>Discard</Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            {isEdit ? "Save" : "Add product"}
          </Button>
        </div>
      </Form>
    </div>
  );
}
