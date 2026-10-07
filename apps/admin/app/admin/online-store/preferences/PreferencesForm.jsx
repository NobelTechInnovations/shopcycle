"use client";

import { useState } from "react";
import { Form, Input, Card, Alert, App } from "antd";
import { PageHeader, SaveBar } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { ImageUploadField } from "@/components/ImageUploadField";
import { storefrontUrlFor } from "@/lib/storefront";

const TITLE_MAX = 70;
const DESCRIPTION_MAX = 160;

/** Online Store ▸ Preferences: how the home page appears in Google and when
 * the store's link is shared on WhatsApp, Instagram or X. Product,
 * collection and blog pages build their own listing from their content. */
export function PreferencesForm({ store, seo, canEdit }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const title = Form.useWatch("title", form);
  const description = Form.useWatch("description", form);
  const image = Form.useWatch("image", form);
  const favicon = Form.useWatch("favicon", form);
  const url = storefrontUrlFor(store);
  const host = url.replace(/^https?:\/\//, "").split("/")[0];

  async function save(values) {
    setSaving(true);
    try {
      await apiFetch("/api/store", { method: "PATCH", body: { settings: { seo: values } } });
      message.success("Preferences saved");
      setDirty(false);
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const shownTitle = title || store.name;
  const shownDescription = description || `Shop ${store.name} online.`;

  return (
    <div>
      <PageHeader title="Preferences" subtitle="How your store shows up in search results, when its link is shared, and on the browser tab" />
      {!canEdit && <Alert className="mb-4" type="info" showIcon message="Only the store owner or an admin can change these." />}

      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        disabled={!canEdit}
        initialValues={{ title: seo.title || "", description: seo.description || "", image: seo.image || "", favicon: seo.favicon || "" }}
        onValuesChange={() => setDirty(true)}
        onFinish={save}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
            <Card size="small" title="Title and meta description">
              <p className="text-sm text-ink-muted mt-0 mb-4">
                Used for your home page. Aim for a title under {TITLE_MAX} characters and a description under {DESCRIPTION_MAX} — search engines cut off the rest.
              </p>
              <Form.Item name="title" label="Home page title">
                <Input maxLength={TITLE_MAX} showCount placeholder={store.name} />
              </Form.Item>
              <Form.Item name="description" label="Meta description" className="mb-0">
                <Input.TextArea rows={3} maxLength={DESCRIPTION_MAX} showCount placeholder="What you sell, in a sentence or two — e.g. Single-origin spices from Meghalaya, packed fresh and shipped across India." />
              </Form.Item>
            </Card>

            <Card size="small" title="Social sharing image">
              <p className="text-sm text-ink-muted mt-0 mb-4">
                Shown when your store's link is shared. 1200 × 630 px works best. Without one, your logo or the first product photo is used.
              </p>
              <Form.Item name="image" className="mb-0">
                <ImageUploadField aspect="1200 / 630" label="Upload share image" />
              </Form.Item>
            </Card>
          </div>

          <div className="flex flex-col gap-6 min-w-0">
            <Card size="small" title="Favicon">
              <p className="text-sm text-ink-muted mt-0 mb-4">
                The small icon on the browser tab and in bookmarks. Use a square image, at least 96 × 96 px (512 × 512 is ideal) — PNG works best.
              </p>
              <Form.Item name="favicon" className="mb-3">
                <ImageUploadField aspect="1 / 1" label="Upload favicon" />
              </Form.Item>
              <div className="flex items-center gap-2 rounded-t-lg border border-b-0 border-app-border bg-app-bg px-3 py-2 max-w-[260px]" aria-hidden="true">
                {favicon ? <img src={favicon} alt="" className="w-4 h-4 rounded-sm object-cover" /> : <span className="w-4 h-4 rounded-sm bg-app-border" />}
                <span className="text-xs text-ink truncate">{shownTitle}</span>
              </div>
            </Card>
            <Card size="small" title="Search result preview">
              <div className="rounded-lg border border-app-border bg-white p-3">
                <p className="m-0 text-xs text-ink-muted truncate">{host}</p>
                <p className="m-0 mt-0.5 text-[16px] leading-snug text-[#1a0dab] line-clamp-2">{shownTitle}</p>
                <p className="m-0 mt-1 text-[13px] leading-snug text-ink-muted line-clamp-3">{shownDescription}</p>
              </div>
            </Card>
            <Card size="small" title="Link preview">
              <div className="rounded-lg border border-app-border overflow-hidden bg-white">
                <div className="bg-app-bg" style={{ aspectRatio: "1200 / 630" }}>
                  {image ? <img src={image} alt="" className="w-full h-full object-cover" /> : null}
                </div>
                <div className="p-3">
                  <p className="m-0 text-[11px] uppercase tracking-wide text-ink-muted truncate">{host}</p>
                  <p className="m-0 text-sm font-semibold text-ink truncate">{shownTitle}</p>
                  <p className="m-0 text-xs text-ink-muted line-clamp-2">{shownDescription}</p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {canEdit && <SaveBar dirty={dirty} saving={saving} onDiscard={() => (form.resetFields(), setDirty(false))} />}
      </Form>
    </div>
  );
}
