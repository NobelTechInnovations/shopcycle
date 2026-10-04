"use client";

import { useMemo, useState } from "react";
import { Form, Input, Select, Button, Card, App } from "antd";
import { apiFetch } from "@/lib/api";
import { getTimezoneOptions } from "@/lib/timezones";
import { SettingsSectionHeader } from "./SettingsNav";

export function GeneralSettings({ store }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);

  async function handleSubmit(values) {
    setSaving(true);
    try {
      await apiFetch("/api/store", { method: "PATCH", body: values });
      message.success("Store details saved");
      setDirty(false);
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SettingsSectionHeader title="Store details" description="Shown to shoppers across your storefront and on order emails." />
      <Card size="small" styles={{ body: { padding: 24 } }} className="max-w-2xl">
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            name: store.name,
            currency: store.currency,
            timezone: store.timezone,
            supportEmail: store.supportEmail,
            supportPhone: store.supportPhone,
          }}
          onFinish={handleSubmit}
          onValuesChange={() => setDirty(true)}
          requiredMark={false}
        >
          <Form.Item name="name" label="Store name" rules={[{ required: true, message: "Enter your store's name" }]}>
            <Input maxLength={120} />
          </Form.Item>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Form.Item name="currency" label="Currency" extra="Prices across your store are shown in this currency.">
              <Select
                options={[
                  { value: "INR", label: "INR — Indian Rupee (₹)" },
                  { value: "USD", label: "USD — US Dollar ($)" },
                  { value: "EUR", label: "EUR — Euro (€)" },
                ]}
              />
            </Form.Item>
            <Form.Item name="timezone" label="Timezone" extra="Used for order times and reports.">
              <Select showSearch options={timezoneOptions} optionFilterProp="label" placeholder="Select a timezone" />
            </Form.Item>
          </div>
          <div className="border-t border-app-border -mx-6 px-6 pt-5 mt-1">
            <p className="text-sm font-semibold text-ink m-0">Customer contact</p>
            <p className="text-[13px] text-ink-muted mt-1 mb-4">
              Where customers reach you. Replies to order emails go here, and it's shown on order pages and invoices. New-order alerts are sent here too.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Form.Item name="supportEmail" label="Support email" rules={[{ type: "email", message: "Enter a valid email" }]}>
              <Input type="email" autoComplete="off" placeholder="help@yourstore.in" />
            </Form.Item>
            <Form.Item name="supportPhone" label="Support phone">
              <Input type="tel" autoComplete="off" inputMode="tel" placeholder="+91 98765 43210" />
            </Form.Item>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-app-border mt-2 -mx-6 px-6 -mb-6 pb-4 pt-4">
            <Button
              disabled={!dirty || saving}
              onClick={() => {
                form.resetFields();
                setDirty(false);
              }}
            >
              Discard
            </Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={!dirty}>
              Save
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
