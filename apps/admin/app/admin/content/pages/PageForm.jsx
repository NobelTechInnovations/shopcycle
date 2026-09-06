"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Select, Button, Card } from "antd";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

export function PageForm({ page }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(page);

  const initialValues = page
    ? { title: page.title, body: page.body, status: page.status, seoTitle: page.seoTitle, seoDescription: page.seoDescription }
    : { status: "draft" };

  async function handleSubmit(values) {
    setSaving(true);
    try {
      if (isEdit) {
        await apiFetch(`/api/pages/${page.id}`, { method: "PATCH", body: values });
      } else {
        await apiFetch("/api/pages", { method: "POST", body: values });
      }
      router.push("/admin/content/pages");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? page.title : "Add page"}
        breadcrumb={<a href="/admin/content/pages">Pages</a>}
      />

      <Form layout="vertical" initialValues={initialValues} onFinish={handleSubmit} requiredMark={false}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Card size="small" title="Content">
              <Form.Item name="title" label="Title" rules={[{ required: true, message: "Title is required" }]}>
                <Input size="large" placeholder="About us" />
              </Form.Item>
              <Form.Item name="body" label="Body" className="mb-0">
                <Input.TextArea rows={10} placeholder="Page content (HTML is fine — it renders as-is)" />
              </Form.Item>
            </Card>

            <Card size="small" title="SEO">
              <Form.Item name="seoTitle" label="Page title">
                <Input />
              </Form.Item>
              <Form.Item name="seoDescription" label="Meta description" className="mb-0">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Card>
          </div>

          <Card size="small" title="Status">
            <Form.Item name="status" className="mb-0">
              <Select
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "active", label: "Active" },
                ]}
              />
            </Form.Item>
          </Card>
        </div>

        <div className="sticky bottom-0 -mx-6 mt-6 bg-app-surface border-t border-app-border px-6 py-3 flex justify-end gap-2">
          <Button onClick={() => router.push("/admin/content/pages")}>Discard</Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            {isEdit ? "Save" : "Add page"}
          </Button>
        </div>
      </Form>
    </div>
  );
}
