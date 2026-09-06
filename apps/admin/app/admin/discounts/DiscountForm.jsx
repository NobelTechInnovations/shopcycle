"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Form, Input, InputNumber, Select, Button, Card } from "antd";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

export function DiscountForm({ discount }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(discount);

  const initialValues = discount
    ? {
        code: discount.code,
        type: discount.type,
        value: Number(discount.value),
        minSubtotal: discount.minSubtotal ? Number(discount.minSubtotal) : undefined,
        usageLimit: discount.usageLimit || undefined,
        status: discount.status,
      }
    : { type: "percentage", status: "active" };

  async function handleSubmit(values) {
    setSaving(true);
    try {
      if (isEdit) {
        await apiFetch(`/api/discounts/${discount.id}`, { method: "PATCH", body: values });
      } else {
        await apiFetch("/api/discounts", { method: "POST", body: values });
      }
      router.push("/admin/discounts");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title={isEdit ? discount.code : "Create discount"} breadcrumb={<a href="/admin/discounts">Discounts</a>} />

      <Form layout="vertical" initialValues={initialValues} onFinish={handleSubmit} requiredMark={false} className="max-w-lg">
        <Card size="small" title="Discount" className="mb-6">
          <Form.Item name="code" label="Code" rules={[{ required: true, message: "Code is required" }]}>
            <Input placeholder="WELCOME10" style={{ textTransform: "uppercase" }} />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="type" label="Type" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: "percentage", label: "Percentage off" },
                  { value: "fixed_amount", label: "Fixed amount off" },
                ]}
              />
            </Form.Item>
            <Form.Item name="value" label="Value" rules={[{ required: true, message: "Required" }]}>
              <InputNumber min={0} className="w-full" />
            </Form.Item>
          </div>
          <Form.Item name="minSubtotal" label="Minimum order subtotal (optional)">
            <InputNumber min={0} className="w-full" prefix="₹" />
          </Form.Item>
          <Form.Item name="usageLimit" label="Usage limit (optional)" className="mb-0">
            <InputNumber min={1} className="w-full" />
          </Form.Item>
        </Card>

        <Card size="small" title="Status">
          <Form.Item name="status" className="mb-0">
            <Select
              options={[
                { value: "active", label: "Active" },
                { value: "disabled", label: "Disabled" },
              ]}
            />
          </Form.Item>
        </Card>

        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={() => router.push("/admin/discounts")}>Discard</Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            {isEdit ? "Save" : "Create discount"}
          </Button>
        </div>
      </Form>
    </div>
  );
}
