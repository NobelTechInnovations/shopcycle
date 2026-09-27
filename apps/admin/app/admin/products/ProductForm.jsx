"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, InputNumber, Select, Button, Card, Upload, App, Modal } from "antd";
import { Plus, Trash2, UploadCloud, Images, Wand2, ExternalLink } from "lucide-react";
import { MediaLibraryModal } from "@/components/MediaLibraryModal";
import { CustomDataFields, metafieldPayload } from "@/components/CustomDataFields";
import { PageHeader, StatusBadge, SaveBar } from "@shopcycle/ui";
import { apiFetch, apiUpload } from "@/lib/api";
import { IMAGE_ACCEPT } from "@/lib/uploads";
import { storefrontUrlFor, storefrontLabelFor } from "@/lib/storefront";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

const MAX_IMAGES = 8;

const OPTION_PRESETS = {
  Size: ["XS", "S", "M", "L", "XL", "XXL"],
  Colour: ["Black", "White", "Navy", "Beige"],
};

/** Every combination of the options' values: [["S","Black"],["S","White"],…]. */
function combinations(options) {
  return options.reduce((acc, opt) => acc.flatMap((prefix) => opt.values.map((v) => [...prefix, v])), [[]]);
}

/**
 * "Create variants from options": pick Size and Colour values (or any
 * option) and get one variant per combination, titled "M / Black" — the
 * format the product page splits back into separate pickers.
 */
function VariantOptionsModal({ open, onClose, onApply }) {
  const [options, setOptions] = useState([
    { name: "Size", values: ["S", "M", "L", "XL"] },
    { name: "Colour", values: [] },
  ]);
  const usable = options.filter((o) => o.name.trim() && o.values.length);
  const count = usable.length ? combinations(usable).length : 0;
  const set = (i, patch) => setOptions((list) => list.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Create variants from options"
      okText={count ? `Create ${count} variant${count === 1 ? "" : "s"}` : "Create variants"}
      okButtonProps={{ disabled: !count || count > 100 }}
      onOk={() => {
        onApply(combinations(usable).map((combo) => combo.join(" / ")));
        onClose();
      }}
      destroyOnHidden
    >
      <p className="text-[13px] text-ink-muted mt-1">
        Shoppers pick each option separately on the product page. Variants that already exist keep their price and stock.
      </p>
      <div className="flex flex-col gap-3">
        {options.map((opt, i) => (
          <div key={i} className="rounded-lg border border-app-border p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Input value={opt.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Option name, e.g. Size" className="max-w-[200px]" aria-label="Option name" />
              {options.length > 1 && (
                <Button type="text" danger size="small" icon={<Trash2 size={13} aria-hidden="true" />} aria-label="Remove option" onClick={() => setOptions((l) => l.filter((_, j) => j !== i))} />
              )}
            </div>
            <Select
              mode="tags"
              value={opt.values}
              onChange={(values) => set(i, { values })}
              tokenSeparators={[","]}
              placeholder="Type a value and press Enter"
              aria-label={`${opt.name || "Option"} values`}
              options={(OPTION_PRESETS[opt.name.trim()] || []).map((v) => ({ value: v, label: v }))}
            />
          </div>
        ))}
        {options.length < 3 && (
          <Button type="dashed" icon={<Plus size={13} aria-hidden="true" />} onClick={() => setOptions((l) => [...l, { name: "", values: [] }])}>
            Add another option
          </Button>
        )}
        {count > 100 && <p className="text-xs text-status-danger m-0">That's {count} combinations — keep it to 100 or fewer.</p>}
      </div>
    </Modal>
  );
}

export function ProductForm({ product, store }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [images, setImages] = useState(
    product ? product.images.map((img) => ({ uid: img.id, url: img.url })) : []
  );
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form] = Form.useForm();
  const seoTitle = Form.useWatch("seoTitle", form);
  const seoDescription = Form.useWatch("seoDescription", form);
  const title = Form.useWatch("title", form);
  const description = Form.useWatch("description", form);
  const isEdit = Boolean(product);

  useEffect(() => {
    apiFetch("/api/brands?pageSize=100").then((data) => setBrands(data.brands));
    apiFetch("/api/categories?pageSize=100").then((data) => setCategories(data.categories));
  }, []);

  const initialValues = product
    ? {
        title: product.title,
        description: product.description,
        status: product.status,
        vendor: product.vendor,
        productType: product.productType,
        brandId: product.brandId,
        categoryId: product.categoryId,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        hsnCode: product.hsnCode,
        metafields: product.metafields || {},
        variants: product.variants.map((v) => ({
          id: v.id,
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
      setDirty(true); // images live outside the form's own values
    } catch (err) {
      message.error(err.message);
    } finally {
      setUploading(false);
    }
    return false; // stop antd's own XHR upload — we already uploaded via apiUpload
  }

  function removeImage(uid) {
    setImages((prev) => prev.filter((img) => img.uid !== uid));
    setDirty(true);
  }

  async function handleSubmit(values) {
    setSaving(true);
    try {
      // Stock is only sent when it was changed here — otherwise the save
      // would overwrite any sales made while this page was open.
      const loadedStock = Object.fromEntries((product?.variants || []).map((v) => [v.id, v.inventoryQuantity]));
      const variants = (values.variants || []).map((v) =>
        v.id && loadedStock[v.id] === v.inventoryQuantity ? { ...v, inventoryQuantity: undefined } : v
      );
      const payload = { ...values, variants, metafields: metafieldPayload(values.metafields), images: images.map((img) => ({ url: img.url })) };
      if (isEdit) {
        await apiFetch(`/api/products/${product.id}`, { method: "PATCH", body: payload });
      } else {
        await apiFetch("/api/products", { method: "POST", body: payload });
      }
      message.success(isEdit ? "Product saved" : "Product added");
      router.push("/admin/products");
      router.refresh();
    } catch (err) {
      message.error(err.message || "Couldn't save the product");
    } finally {
      setSaving(false);
    }
  }

  /** Replaces the variant list with one row per option combination,
   * keeping id, price and stock for titles that already exist. */
  function applyVariantTitles(titles) {
    const current = form.getFieldValue("variants") || [];
    const byTitle = Object.fromEntries(current.map((v) => [String(v.title || "").trim().toLowerCase(), v]));
    const base = current[0] || { price: 0 };
    form.setFieldValue(
      "variants",
      titles.map((t) => byTitle[t.toLowerCase()] || { title: t, price: base.price, comparePrice: base.comparePrice, inventoryQuantity: 0 })
    );
    setDirty(true);
  }

  const previewTitle = seoTitle || title || "Product title";
  const previewDescription = seoDescription || description || "A short description of this product will appear here.";

  return (
    <div>
      <PageHeader
        title={isEdit ? product.title : "Add product"}
        backHref="/admin/products"
        meta={isEdit ? <StatusBadge status={product.status} /> : null}
        actions={
          isEdit && store && product.status === "active" ? (
            <Button href={`${storefrontUrlFor(store)}/products/${product.slug}`} target="_blank" icon={<ExternalLink size={14} aria-hidden="true" />}>
              View on store
            </Button>
          ) : null
        }
      />

      <Form form={form} layout="vertical" initialValues={initialValues} onFinish={handleSubmit} onValuesChange={() => setDirty(true)} requiredMark={false}>
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
                        <Form.Item {...restField} name={[name, "id"]} hidden>
                          <Input />
                        </Form.Item>
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
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="dashed"
                        icon={<Plus size={14} aria-hidden="true" />}
                        onClick={() => add({ title: "", price: 0, inventoryQuantity: 0 })}
                      >
                        Add variant
                      </Button>
                      <Button icon={<Wand2 size={14} aria-hidden="true" />} onClick={() => setOptionsOpen(true)}>
                        Create from options (size, colour…)
                      </Button>
                    </div>
                  </div>
                )}
              </Form.List>
              <VariantOptionsModal open={optionsOpen} onClose={() => setOptionsOpen(false)} onApply={applyVariantTitles} />
            </Card>

            <Card size="small" title="Images">
              <Upload
                listType="picture-card"
                fileList={images.map((img) => ({ uid: img.uid, url: img.url, status: "done", name: "image" }))}
                beforeUpload={handleImageUpload}
                onRemove={(file) => removeImage(file.uid)}
                accept={IMAGE_ACCEPT}
              >
                {images.length < MAX_IMAGES && (
                  <div className="flex flex-col items-center text-xs text-ink-muted">
                    <UploadCloud size={18} aria-hidden="true" />
                    <span className="mt-1">{uploading ? "Uploading…" : "Upload"}</span>
                  </div>
                )}
              </Upload>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                <p className="text-xs text-ink-muted m-0">JPEG, PNG, WebP or GIF — up to 8MB, {MAX_IMAGES} images.</p>
                {images.length < MAX_IMAGES && (
                  <Button size="small" icon={<Images size={13} aria-hidden="true" />} onClick={() => setLibraryOpen(true)}>
                    Choose from Files
                  </Button>
                )}
              </div>
              <MediaLibraryModal
                open={libraryOpen}
                multiple
                max={MAX_IMAGES - images.length}
                onClose={() => setLibraryOpen(false)}
                onSelect={(urls) => {
                  setImages((list) => [...list, ...urls.map((url) => ({ uid: `lib-${url}-${Math.random().toString(36).slice(2)}`, url }))]);
                  setDirty(true);
                }}
              />
            </Card>

            <CustomDataFields ownerType="product" />

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
                  <p className="text-[#006621] text-xs m-0 truncate">
                    {store ? storefrontLabelFor(store) : "your-store"}/products/{product?.slug || "…"}
                  </p>
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
              <Form.Item name="categoryId" label="Category">
                <Select
                  allowClear
                  placeholder="Select category"
                  optionFilterProp="label"
                  options={categories.map((c) => ({ value: c.id, label: c.title }))}
                />
              </Form.Item>
              <Form.Item name="brandId" label="Brand">
                <Select
                  allowClear
                  placeholder="Select brand"
                  optionFilterProp="label"
                  options={brands.map((b) => ({ value: b.id, label: b.title }))}
                />
              </Form.Item>
              <Form.Item name="productType" label="Product type">
                <Input />
              </Form.Item>
              <Form.Item name="vendor" label="Vendor" className="mb-0">
                <Input />
              </Form.Item>
            </Card>
            <Card size="small" title="Tax">
              <Form.Item
                name="hsnCode"
                label="HSN code"
                className="mb-0"
                extra="Printed on GST invoices. 4–8 digits, e.g. 6109 for cotton T-shirts."
                rules={[{ pattern: /^\d{4,8}$/, message: "HSN codes are 4 to 8 digits" }]}
              >
                <Input inputMode="numeric" placeholder="6109" />
              </Form.Item>
            </Card>
          </div>
        </div>

        {/* Sticky action bar, per the "sticky action areas" pattern used across the admin. */}
        <SaveBar
          dirty={dirty}
          isNew={!isEdit}
          saving={saving}
          saveLabel={isEdit ? "Save" : "Add product"}
          onDiscard={() => router.push("/admin/products")}
        />
      </Form>
    </div>
  );
}
