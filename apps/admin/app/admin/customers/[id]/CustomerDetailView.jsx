"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Table, Form, Input, Checkbox, Button, App } from "antd";
import { PageHeader, StatusBadge } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";

// Defined inside this Client Component on purpose — antd's <Table> can't
// receive a `columns` array containing function-valued `render` fields as
// a prop from a Server Component (RSC only serializes plain data across
// that boundary), which is exactly what crashed this page before.
const orderColumns = [
  { title: "Order", dataIndex: "orderNumber", render: (n) => `#${n}` },
  { title: "Date", dataIndex: "createdAt", render: (d) => new Date(d).toLocaleDateString() },
  { title: "Total", dataIndex: "total", render: (v) => formatCurrency(v) },
  { title: "Payment", dataIndex: "paymentStatus", render: (s) => <StatusBadge status={s} /> },
  { title: "Fulfillment", dataIndex: "fulfillmentStatus", render: (s) => <StatusBadge status={s} /> },
];

export function CustomerDetailView({ customer }) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);

  async function handleSave(values) {
    setSaving(true);
    try {
      await apiFetch(`/api/customers/${customer.id}`, { method: "PATCH", body: values });
      message.success("Customer saved");
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title={customer.name} breadcrumb={<Link href="/admin/customers">Customers</Link>} />

      <Form
        layout="vertical"
        initialValues={{
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          address1: customer.address1,
          address2: customer.address2,
          city: customer.city,
          province: customer.province,
          zip: customer.zip,
          country: customer.country,
          acceptsEmailMarketing: customer.acceptsEmailMarketing,
          acceptsSmsMarketing: customer.acceptsSmsMarketing,
        }}
        onFinish={handleSave}
        requiredMark={false}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Card size="small" title="Order history">
              <Table rowKey="id" columns={orderColumns} dataSource={customer.orders} pagination={false} />
            </Card>

            <Card size="small" title="Address">
              <Form.Item name="address1" label="Address line 1">
                <Input />
              </Form.Item>
              <Form.Item name="address2" label="Address line 2">
                <Input />
              </Form.Item>
              <div className="grid grid-cols-2 gap-4">
                <Form.Item name="city" label="City">
                  <Input />
                </Form.Item>
                <Form.Item name="province" label="State / Province">
                  <Input />
                </Form.Item>
                <Form.Item name="zip" label="Postal code">
                  <Input />
                </Form.Item>
                <Form.Item name="country" label="Country">
                  <Input />
                </Form.Item>
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card size="small" title="Contact information">
              <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name is required" }]}>
                <Input />
              </Form.Item>
              <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
                <Input />
              </Form.Item>
              <Form.Item name="phone" label="Phone" className="mb-0">
                <Input />
              </Form.Item>
            </Card>

            <Card size="small" title="Marketing">
              <Form.Item name="acceptsEmailMarketing" valuePropName="checked" className="mb-2">
                <Checkbox>Accepts email marketing</Checkbox>
              </Form.Item>
              <Form.Item name="acceptsSmsMarketing" valuePropName="checked" className="mb-0">
                <Checkbox>Accepts SMS marketing</Checkbox>
              </Form.Item>
            </Card>

            <Button type="primary" htmlType="submit" loading={saving} block>
              Save
            </Button>
          </div>
        </div>
      </Form>
    </div>
  );
}
