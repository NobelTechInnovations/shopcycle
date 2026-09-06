"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Form, InputNumber, Select, Button, Card } from "antd";
import { Plus } from "lucide-react";
import { PageHeader } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";
import { OrderItemRow } from "./OrderItemRow";

export default function NewOrderPage() {
  const router = useRouter();
  const [form] = Form.useForm();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const items = Form.useWatch("items", form) || [];
  const discount = Form.useWatch("discount", form) || 0;
  const shipping = Form.useWatch("shipping", form) || 0;
  const tax = Form.useWatch("tax", form) || 0;

  useEffect(() => {
    apiFetch("/api/customers?pageSize=100").then((data) => setCustomers(data.customers));
    apiFetch("/api/products?pageSize=100").then((data) => setProducts(data.products.filter((p) => p.status === "active")));
  }, []);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + (item?.quantity || 0) * (item?.price || 0), 0),
    [items]
  );
  const total = subtotal - discount + shipping + tax;

  async function handleSubmit(values) {
    setSaving(true);
    try {
      const order = await apiFetch("/api/orders", { method: "POST", body: values });
      router.push(`/admin/orders/${order.order.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Create order" breadcrumb={<a href="/admin/orders">Orders</a>} />

      <Form
        layout="vertical"
        form={form}
        initialValues={{
          items: [{ quantity: 1, price: 0, isCustom: false }],
          discount: 0,
          shipping: 0,
          tax: 0,
          paymentStatus: "pending",
        }}
        onFinish={handleSubmit}
        requiredMark={false}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <Card size="small" title="Line items">
              <Form.List name="items">
                {(fields, { add, remove }) => (
                  <div className="flex flex-col gap-3">
                    {fields.map((field) => (
                      <OrderItemRow
                        key={field.key}
                        field={field}
                        restField={field}
                        form={form}
                        products={products}
                        canRemove={fields.length > 1}
                        onRemove={() => remove(field.name)}
                      />
                    ))}
                    <Button
                      type="dashed"
                      icon={<Plus size={14} aria-hidden="true" />}
                      onClick={() => add({ quantity: 1, price: 0, isCustom: false })}
                    >
                      Add line item
                    </Button>
                  </div>
                )}
              </Form.List>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card size="small" title="Customer">
              <Form.Item name="customerId" className="mb-0">
                <Select
                  allowClear
                  placeholder="Guest checkout"
                  optionFilterProp="label"
                  options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.email})` }))}
                />
              </Form.Item>
            </Card>

            <Card size="small" title="Payment">
              <Form.Item name="paymentStatus" label="Status" className="mb-3">
                <Select
                  options={[
                    { value: "pending", label: "Pending" },
                    { value: "paid", label: "Paid" },
                  ]}
                />
              </Form.Item>
              <Form.Item name="discount" label="Discount" className="mb-3">
                <InputNumber min={0} prefix="₹" className="w-full" />
              </Form.Item>
              <Form.Item name="shipping" label="Shipping" className="mb-3">
                <InputNumber min={0} prefix="₹" className="w-full" />
              </Form.Item>
              <Form.Item name="tax" label="Tax" className="mb-0">
                <InputNumber min={0} prefix="₹" className="w-full" />
              </Form.Item>
            </Card>

            <Card size="small" title="Summary">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-ink-muted">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-ink-muted">Discount</span>
                <span>-{formatCurrency(discount)}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-ink-muted">Shipping</span>
                <span>{formatCurrency(shipping)}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-ink-muted">Tax</span>
                <span>{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-app-border pt-2">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </Card>
          </div>
        </div>

        <div className="sticky bottom-0 -mx-6 mt-6 bg-app-surface border-t border-app-border px-6 py-3 flex justify-end gap-2">
          <Button onClick={() => router.push("/admin/orders")}>Discard</Button>
          <Button type="primary" htmlType="submit" loading={saving}>
            Create order
          </Button>
        </div>
      </Form>
    </div>
  );
}
