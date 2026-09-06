"use client";

import { useState } from "react";
import { Card, Form, Input, Button, App, Alert } from "antd";
import { apiFetch } from "@/lib/api";

export function DomainSettings({ store }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  async function handleSave(values) {
    setSaving(true);
    try {
      const { store: updated } = await apiFetch("/api/store", { method: "PATCH", body: { domain: values.domain || "" } });
      form.setFieldsValue({ domain: updated.domain || "" });
      message.success(updated.domain ? "Domain saved" : "Domain removed");
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg">
      <Card size="small" title="Custom domain">
        <p className="text-sm text-ink-muted mt-0">
          Point your domain's DNS at this platform (a CNAME to your hosting provider), then enter it here — visitors
          to that domain will see this store instead of needing to know its <code>/store/{store.handle}</code> path.
        </p>
        <Form layout="vertical" form={form} onFinish={handleSave} initialValues={{ domain: store.domain || "" }} requiredMark={false}>
          <Form.Item
            name="domain"
            label="Domain"
            rules={[
              {
                pattern: /^$|^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i,
                message: "Enter a valid domain, e.g. shop.example.com",
              },
            ]}
          >
            <Input placeholder="shop.example.com" />
          </Form.Item>
          {store.domain && (
            <Alert
              type="info"
              showIcon
              className="mb-4"
              message={`Currently live at ${store.domain} and /store/${store.handle}`}
            />
          )}
          <Button type="primary" htmlType="submit" loading={saving}>
            Save
          </Button>
        </Form>
      </Card>
    </div>
  );
}
