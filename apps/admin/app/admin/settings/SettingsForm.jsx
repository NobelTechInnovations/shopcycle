"use client";

import { useMemo, useState } from "react";
import { Form, Input, Select, Button, Card, Tabs, App } from "antd";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { getTimezoneOptions } from "@/lib/timezones";
import { ShippingSettings } from "./ShippingSettings";
import { TaxSettings } from "./TaxSettings";
import { TeamSettings } from "./TeamSettings";
import { BillingSettings } from "./BillingSettings";
import { DomainSettings } from "./DomainSettings";

export function SettingsForm({ store }) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);

  async function handleSubmit(values) {
    setSaving(true);
    try {
      await apiFetch("/api/store", { method: "PATCH", body: values });
      message.success("Store settings saved");
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" />
      <Tabs
        items={[
          {
            key: "general",
            label: "General",
            children: (
              <Card size="small" className="max-w-lg">
                <Form
                  layout="vertical"
                  initialValues={{ name: store.name, currency: store.currency, timezone: store.timezone }}
                  onFinish={handleSubmit}
                  requiredMark={false}
                >
                  <Form.Item name="name" label="Store name" rules={[{ required: true, message: "Required" }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="currency" label="Currency">
                    <Select
                      options={[
                        { value: "INR", label: "INR — Indian Rupee" },
                        { value: "USD", label: "USD — US Dollar" },
                        { value: "EUR", label: "EUR — Euro" },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="timezone" label="Timezone" className="mb-4">
                    <Select
                      showSearch
                      options={timezoneOptions}
                      optionFilterProp="label"
                      placeholder="Select a timezone"
                    />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={saving}>
                    Save
                  </Button>
                </Form>
              </Card>
            ),
          },
          {
            key: "shipping",
            label: "Shipping",
            children: <ShippingSettings />,
          },
          {
            key: "taxes",
            label: "Taxes",
            children: <TaxSettings />,
          },
          {
            key: "team",
            label: "Team",
            children: <TeamSettings />,
          },
          {
            key: "billing",
            label: "Billing",
            children: <BillingSettings />,
          },
          {
            key: "domains",
            label: "Domains",
            children: <DomainSettings store={store} />,
          },
        ]}
      />
    </div>
  );
}
