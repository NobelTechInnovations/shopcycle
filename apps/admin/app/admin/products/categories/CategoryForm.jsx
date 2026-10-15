"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Form, Input, Card } from "antd";
import { Grid3x3, Package } from "lucide-react";
import { PageHeader, SaveBar } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { ImageUploadField } from "@/components/ImageUploadField";

/** Add or edit a category: its name and picture, with a preview of how
 * the category tile looks on the store. */
export function CategoryForm({ category }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const isEdit = Boolean(category);
  const title = Form.useWatch("title", form);
  const image = Form.useWatch("image", form);
  const count = category?._count?.products ?? 0;

  async function handleSubmit(values) {
    setSaving(true);
    try {
      const body = { title: values.title?.trim(), image: values.image || null };
      if (isEdit) await apiFetch(`/api/categories/${category.id}`, { method: "PATCH", body });
      else await apiFetch("/api/categories", { method: "POST", body });
      message.success(isEdit ? "Category saved" : `Category “${body.title}” added`);
      setDirty(false);
      router.push("/admin/products/categories");
      router.refresh();
    } catch (err) {
      message.error(err.message || "Couldn't save the category");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title={isEdit ? category.title : "Add category"} subtitle={isEdit ? `${count} ${count === 1 ? "product" : "products"}` : "What a product is — Shirts, Spices, Earrings. Shoppers filter by it."} backHref="/admin/products/categories" />

      <Form form={form} layout="vertical" initialValues={category ? { title: category.title, image: category.image } : {}} onFinish={handleSubmit} onValuesChange={() => setDirty(true)} requiredMark={false}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
          <div className="flex flex-col gap-5">
            <Card size="small" title="Name">
              <Form.Item name="title" rules={[{ required: true, whitespace: true, message: "Give the category a name" }]} className="mb-0" extra="Short and clear — e.g. “Turmeric”, “Silk sarees”.">
                <Input size="large" placeholder="e.g. Spices" maxLength={80} autoFocus={!isEdit} />
              </Form.Item>
            </Card>
            <Card size="small" title="Image">
              <Form.Item name="image" className="mb-0">
                <ImageUploadField />
              </Form.Item>
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <Card size="small" title="Preview">
              <div className="flex flex-col items-center gap-2 py-2">
                <span className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-app-border bg-app-bg text-ink-subtle">
                  {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <Grid3x3 size={28} aria-hidden="true" />}
                </span>
                <span className="text-[14px] font-medium text-ink">{title || "Category name"}</span>
                <span className="text-[12px] text-ink-muted text-center">How it shows in category rows and filters on your store.</span>
              </div>
            </Card>
            {isEdit && (
              <Card size="small" title="Products">
                <p className="m-0 text-[13px] text-ink-muted">
                  {count ? `${count} ${count === 1 ? "product is" : "products are"} in this category.` : "No products yet — pick this category on a product's page, under Organise."}
                </p>
                {count > 0 && (
                  <Link href={`/admin/products?categoryId=${category.id}`} className="mt-2 inline-flex items-center gap-1.5 text-[13px]">
                    <Package size={13} aria-hidden="true" /> View products
                  </Link>
                )}
              </Card>
            )}
          </div>
        </div>

        <SaveBar dirty={dirty} isNew={!isEdit} saving={saving} saveLabel={isEdit ? "Save" : "Add category"} onDiscard={() => router.push("/admin/products/categories")} />
      </Form>
    </div>
  );
}
