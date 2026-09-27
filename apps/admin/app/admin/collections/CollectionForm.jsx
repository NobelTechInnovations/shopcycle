"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, Select, Card, App } from "antd";
import { PageHeader, SaveBar } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { ImageUploadField } from "@/components/ImageUploadField";
import { CustomDataFields, metafieldPayload } from "@/components/CustomDataFields";

export function CollectionForm({ collection }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
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
        image: collection.image || null,
        metafields: collection.metafields || {},
        productIds: collection.products.map((p) => p.productId),
      }
    : { status: "draft", productIds: [] };

  async function handleSubmit(values) {
    setSaving(true);
    try {
      const body = { ...values, image: values.image || null, metafields: metafieldPayload(values.metafields) };
      if (isEdit) {
        await apiFetch(`/api/collections/${collection.id}`, { method: "PATCH", body });
      } else {
        await apiFetch("/api/collections", { method: "POST", body });
      }
      message.success(isEdit ? "Collection saved" : "Collection created");
      router.push("/admin/collections");
      router.refresh();
    } catch (err) {
      message.error(err.message || "Couldn't save the collection");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? collection.title : "Create collection"}
        backHref="/admin/collections"
      />

      <Form layout="vertical" initialValues={initialValues} onFinish={handleSubmit} onValuesChange={() => setDirty(true)} requiredMark={false}>
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

            <CustomDataFields ownerType="collection" />
          </div>

          <div className="flex flex-col gap-6">
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
            <Card size="small" title="Collection image">
              <Form.Item name="image" className="mb-0" extra="Shown on collection tiles and at the top of the collection page.">
                <ImageUploadField aspect="4 / 3" label="Upload image" />
              </Form.Item>
            </Card>
          </div>
        </div>

        <SaveBar
          dirty={dirty}
          isNew={!isEdit}
          saving={saving}
          saveLabel={isEdit ? "Save" : "Create collection"}
          onDiscard={() => router.push("/admin/collections")}
        />
      </Form>
    </div>
  );
}
