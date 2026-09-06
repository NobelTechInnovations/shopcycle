"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Select, Button, Card } from "antd";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

export function CollectionForm({ collection }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState([]);
  const isEdit = Boolean(collection);

  useEffect(() => {
    apiFetch("/api/products?pageSize=100").then((data) => setProducts(data.products));
  }, []);

  const initialValues = collection
    ? {
        title: collection.title,
        description: collection.description,
        status: collection.status,
        productIds: collection.products.map((p) => p.productId),
      }
    : { status: "draft", productIds: [] };

  async function handleSubmit(values) {
    setSaving(true);
    try {
      if (isEdit) {
        await apiFetch(`/api/collections/${collection.id}`, { method: "PATCH", body: values });
      } else {
        await apiFetch("/api/collections", { method: "POST", body: values });
      }
      router.push("/admin/collections");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? collection.title : "Create collection"}
        breadcrumb={<a href="/admin/collections">Collections</a>}
      />

      <Form layout="vertical" initialValues={initialValues} onFinish={handleSubmit} requiredMark={false}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Card size="small" title="Title & description">
              <Form.Item name="title" label="Title" rules={[{ required: true, message: "Title is required" }]}>
                <Input size="large" />
              </Form.Item>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={4} />
              </Form.Item>
            </Card>

            <Card size="small" title="Products">
              <Form.Item name="productIds" label="Select products to include" className="mb-0">
                <Select
                  mode="multiple"
                  placeholder="Search products"
                  optionFilterProp="label"
                  options={products.map((p) => ({ value: p.id, label: p.title }))}
                />
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
          <Button onClick={() => router.push("/admin/collections")}>Discard</Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            {isEdit ? "Save" : "Create collection"}
          </Button>
        </div>
      </Form>
    </div>
  );
}
