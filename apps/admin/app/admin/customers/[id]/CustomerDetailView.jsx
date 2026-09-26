"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Table, Form, Input, Checkbox, App } from "antd";
import { Mail, Phone, ShoppingBag } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState, SaveBar } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";
import { initials } from "@/lib/storefront";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

// Calendar days in IST, not 24-hour periods — last night's order reads
// "Yesterday". Pinned to IST like formatDate so the server render (UTC in
// production) and the browser agree.
const istDay = (d) => Date.parse(new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));

function relativeDays(iso) {
  const days = Math.round((istDay(Date.now()) - istDay(iso)) / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDate(iso);
}

// Defined inside this Client Component on purpose — antd's <Table> can't
// receive a `columns` array containing function-valued `render` fields as
// a prop from a Server Component (RSC only serializes plain data across
// that boundary), which is exactly what crashed this page before.
const orderColumns = [
  {
    title: "Order",
    dataIndex: "orderNumber",
    render: (n, row) => (
      <Link href={`/admin/orders/${row.id}`} className="font-medium text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
        #{n}
      </Link>
    ),
  },
  {
    title: "Date",
    dataIndex: "createdAt",
    responsive: ["sm"],
    render: (d) => <span className="text-[13px] text-ink-muted">{formatDate(d)}</span>,
  },
  { title: "Payment", dataIndex: "paymentStatus", render: (s) => <StatusBadge status={s} /> },
  { title: "Fulfillment", dataIndex: "fulfillmentStatus", responsive: ["md"], render: (s) => <StatusBadge status={s} /> },
  {
    title: "Total",
    dataIndex: "total",
    align: "right",
    render: (v) => <span className="font-medium tabular-nums">{formatCurrency(v)}</span>,
  },
];

function Stat({ label, value, hint }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card px-[18px] py-4 min-w-0">
      <p className="text-[13px] text-ink-muted m-0">{label}</p>
      <p className="text-[22px] leading-tight font-semibold text-ink mt-1 mb-0 tabular-nums truncate" style={{ letterSpacing: "-0.02em" }}>
        {value}
      </p>
      {hint && <p className="text-xs text-ink-muted mt-1 mb-0 truncate">{hint}</p>}
    </div>
  );
}

export function CustomerDetailView({ customer }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const stats = useMemo(() => {
    const orders = customer.orders || [];
    // Same rule as the API's amount spent: paid (or partly refunded), not cancelled.
    const counted = orders.filter((o) => ["paid", "partially_refunded"].includes(o.paymentStatus) && o.fulfillmentStatus !== "cancelled");
    const spent = Number(customer.totalSpent ?? 0);
    return {
      orderCount: orders.length,
      paidCount: counted.length,
      spent,
      average: counted.length ? spent / counted.length : 0,
      lastOrder: orders[0] || null,
    };
  }, [customer]);

  const location = [customer.city, customer.province].filter(Boolean).join(", ");

  async function handleSave(values) {
    setSaving(true);
    try {
      await apiFetch(`/api/customers/${customer.id}`, { method: "PATCH", body: values });
      message.success("Customer saved");
      setDirty(false);
      router.refresh();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    form.resetFields();
    setDirty(false);
  }

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="w-9 h-9 rounded-full bg-app-bg border border-app-border text-ink-muted text-xs font-semibold flex items-center justify-center shrink-0"
            >
              {initials(customer.name)}
            </span>
            {customer.name}
          </span>
        }
        backHref="/admin/customers"
        meta={customer.acceptsEmailMarketing ? <StatusBadge status="active" label="Subscribed" /> : null}
        subtitle={[location, `Customer since ${formatDate(customer.createdAt)}`].filter(Boolean).join(" · ")}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat
          label="Amount spent"
          value={formatCurrency(stats.spent)}
          hint={stats.orderCount > stats.paidCount ? `${stats.paidCount} paid of ${stats.orderCount}` : null}
        />
        <Stat label="Orders" value={stats.orderCount} />
        <Stat label="Average order" value={stats.paidCount ? formatCurrency(stats.average) : "—"} />
        <Stat
          label="Last order"
          value={stats.lastOrder ? relativeDays(stats.lastOrder.createdAt) : "—"}
          hint={stats.lastOrder ? `#${stats.lastOrder.orderNumber} · ${formatCurrency(stats.lastOrder.total)}` : null}
        />
      </div>

      <Form
        form={form}
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
        onValuesChange={() => setDirty(true)}
        requiredMark={false}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
            <Card size="small" title="Order history" styles={{ body: { padding: 0 } }}>
              <Table
                rowKey="id"
                size="middle"
                scroll={{ x: "max-content" }}
                columns={orderColumns}
                dataSource={customer.orders}
                pagination={customer.orders.length > 10 && { pageSize: 10, showSizeChanger: false }}
                rowClassName="oy-row-link"
                onRow={(row) => ({ onClick: () => router.push(`/admin/orders/${row.id}`) })}
                locale={{
                  emptyText: (
                    <EmptyState
                      icon={<ShoppingBag />}
                      title="No orders yet"
                      description="Orders this customer places on your store, or that you create for them, show up here."
                    />
                  ),
                }}
              />
            </Card>

            <Card size="small" title="Default address">
              <Form.Item name="address1" label="Address line 1">
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name="address2" label="Address line 2">
                <Input autoComplete="off" />
              </Form.Item>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <Form.Item name="city" label="City">
                  <Input autoComplete="off" />
                </Form.Item>
                <Form.Item name="province" label="State">
                  <Input autoComplete="off" />
                </Form.Item>
                <Form.Item name="zip" label="PIN code" className="sm:mb-0">
                  <Input autoComplete="off" inputMode="numeric" />
                </Form.Item>
                <Form.Item name="country" label="Country" className="mb-0">
                  <Input autoComplete="off" />
                </Form.Item>
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-6 min-w-0">
            <Card size="small" title="Contact information">
              <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name is required" }]}>
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: "Email is required" },
                  { type: "email", message: "Enter a valid email" },
                ]}
              >
                <Input autoComplete="off" prefix={<Mail size={14} className="text-ink-subtle" aria-hidden="true" />} />
              </Form.Item>
              <Form.Item name="phone" label="Phone" className="mb-0">
                <Input autoComplete="off" inputMode="tel" prefix={<Phone size={14} className="text-ink-subtle" aria-hidden="true" />} />
              </Form.Item>
            </Card>

            <Card size="small" title="Marketing">
              <p className="text-[13px] text-ink-muted mt-0 mb-3">
                Only change these when the customer has asked you to. Consent should come from them.
              </p>
              <Form.Item name="acceptsEmailMarketing" valuePropName="checked" className="mb-2">
                <Checkbox>Email subscriber</Checkbox>
              </Form.Item>
              <Form.Item name="acceptsSmsMarketing" valuePropName="checked" className="mb-0">
                <Checkbox>SMS subscriber</Checkbox>
              </Form.Item>
            </Card>
          </div>
        </div>

        <SaveBar dirty={dirty} saving={saving} onDiscard={handleDiscard} />
      </Form>
    </div>
  );
}
