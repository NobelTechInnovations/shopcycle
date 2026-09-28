"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Form, Input, Select, Card, App, Button } from "antd";
import { Copy, ExternalLink } from "lucide-react";
import { PageHeader, SaveBar } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { ImageUploadField } from "@/components/ImageUploadField";
import { CustomDataFields, metafieldPayload } from "@/components/CustomDataFields";
import { SavedPanel } from "@/components/SavedPanel";
import { storefrontUrlFor } from "@/lib/storefront";

/** `template` (Duplicate): a collection whose details pre-fill a new one. */
export function CollectionForm({ collection, template, store, justCreated = false }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(Boolean(template));
  const [saved, setSaved] = useState(justCreated ? "created" : null);
  const [products, setProducts] = useState([]);
  const isEdit = Boolean(collection);
  const source = collection || template;
  const liveUrl = isEdit && store && collection.status === "active" ? `${storefrontUrlFor(store)}/collections/${collection.slug}` : null;

  useEffect(() => {
    apiFetch("/api/products?pageSize=100").then((data) => setProducts(data.products));
  }, []);

  const initialValues = source
    ? {
        title: template ? `Copy of ${template.title}` : source.title,
        description: source.description,
        status: template ? "draft" : source.status,
        image: source.image || null,
        metafields: source.metafields || {},
        productIds: source.products.map((p) => p.productId),
      }
    : { status: "draft", productIds: [] };

  async function handleSubmit(values) {
    setSaving(true);
    try {
      const body = { ...values, image: values.image || null, metafields: metafieldPayload(values.metafields) };
      if (isEdit) {
        await apiFetch(`/api/collections/${collection.id}`, { method: "PATCH", body });
        setDirty(false);
        setSaved("saved");
        router.refresh();
      } else {
        const { collection: created } = await apiFetch("/api/collections", { method: "POST", body });
        setDirty(false);
        router.replace(`/admin/collections/${created.id}?saved=new`);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
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
        actions={
          isEdit ? (
            <div className="flex gap-2">
              <Link href={`/admin/collections/new?from=${collection.id}`}>
                <Button icon={<Copy size={14} aria-hidden="true" />}>Duplicate</Button>
              </Link>
              {liveUrl && (
                <Button href={liveUrl} target="_blank" icon={<ExternalLink size={14} aria-hidden="true" />}>
                  View on store
                </Button>
              )}
            </div>
          ) : null
        }
      />

      {isEdit && saved && !dirty && (
        <SavedPanel
          title={saved === "created" ? "Collection created" : "Changes saved"}
          detail={collection.status === "active" ? "It's live on your store." : "It's a draft — set Status to Active to show it on your store."}
          viewUrl={liveUrl}
          duplicateHref={`/admin/collections/new?from=${collection.id}`}
          addHref="/admin/collections/new"
          addLabel="Add another collection"
          onClose={() => setSaved(null)}
        />
      )}

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
