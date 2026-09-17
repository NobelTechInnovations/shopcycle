"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Button, Card } from "antd";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

export function BrandForm({ brand }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(brand);

  const initialValues = brand ? { title: brand.title, image: brand.image } : {};

  async function handleSubmit(values) {
    setSaving(true);
    try {
      if (isEdit) {
        await apiFetch(`/api/brands/${brand.id}`, { method: "PATCH", body: values });
      } else {
        await apiFetch("/api/brands", { method: "POST", body: values });
      }
      router.push("/admin/products/brands");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? brand.title : "Add brand"}
        breadcrumb={<a href="/admin/products/brands">Brands</a>}
      />

      <Form layout="vertical" initialValues={initialValues} onFinish={handleSubmit} requiredMark={false}>
        <div className="max-w-xl">
          <Card size="small" title="Brand details">
            <Form.Item name="title" label="Title" rules={[{ required: true, message: "Title is required" }]}>
              <Input size="large" />
            </Form.Item>
            <Form.Item name="image" label="Image URL" className="mb-0">
              <Input placeholder="https://..." />
            </Form.Item>
          </Card>
        </div>

        <div className="sticky bottom-0 -mx-6 mt-6 bg-app-surface border-t border-app-border px-6 py-3 flex justify-end gap-2">
          <Button onClick={() => router.push("/admin/products/brands")}>Discard</Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            {isEdit ? "Save" : "Add brand"}
          </Button>
        </div>
      </Form>
    </div>
  );
}
