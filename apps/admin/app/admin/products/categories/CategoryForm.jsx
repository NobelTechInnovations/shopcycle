"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Button, Card } from "antd";
import { PageHeader, SaveBar } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

export function CategoryForm({ category }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const isEdit = Boolean(category);

  const initialValues = category ? { title: category.title, image: category.image } : {};

  async function handleSubmit(values) {
    setSaving(true);
    try {
      if (isEdit) {
        await apiFetch(`/api/categories/${category.id}`, { method: "PATCH", body: values });
      } else {
        await apiFetch("/api/categories", { method: "POST", body: values });
      }
      router.push("/admin/products/categories");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? category.title : "Add category"}
        backHref="/admin/products/categories"
      />

      <Form layout="vertical" initialValues={initialValues} onFinish={handleSubmit} onValuesChange={() => setDirty(true)} requiredMark={false}>
        <div className="max-w-xl">
          <Card size="small" title="Category details">
            <Form.Item name="title" label="Title" rules={[{ required: true, message: "Title is required" }]}>
              <Input size="large" />
            </Form.Item>
            <Form.Item name="image" label="Image URL" className="mb-0">
              <Input placeholder="https://..." />
            </Form.Item>
          </Card>
        </div>

        <SaveBar
          dirty={dirty}
          isNew={!isEdit}
          saving={saving}
          saveLabel={isEdit ? "Save" : "Add category"}
          onDiscard={() => router.push("/admin/products/categories")}
        />
      </Form>
    </div>
  );
}
