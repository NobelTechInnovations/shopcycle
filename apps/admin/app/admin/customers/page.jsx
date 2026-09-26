"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Input, Button, Modal, Form, App } from "antd";
import { Plus, Users, Search } from "lucide-react";
import { PageHeader, EmptyState, ListCard, SearchInput } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";
import { initials } from "@/lib/storefront";

export default function CustomersPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q) params.set("q", q);
      const data = await apiFetch(`/api/customers?${params.toString()}`);
      setCustomers(data.customers);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(values) {
    setSaving(true);
    try {
      await apiFetch("/api/customers", { method: "POST", body: values });
      message.success(`${values.name} added`);
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      title: "Customer",
      dataIndex: "name",
      render: (name, row) => (
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-full bg-app-bg border border-app-border text-ink-muted text-xs font-semibold flex items-center justify-center shrink-0">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <Link
              href={`/admin/customers/${row.id}`}
              className="font-medium text-ink hover:underline block truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {name}
            </Link>
            <span className="text-xs text-ink-muted block truncate">{row.email}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Location",
      responsive: ["md"],
      width: 180,
      render: (_, row) => (
        <span className="text-[13px] text-ink-muted">{[row.city, row.province].filter(Boolean).join(", ") || "—"}</span>
      ),
    },
    {
      title: "Orders",
      responsive: ["sm"],
      dataIndex: "orderCount",
      width: 100,
      align: "right",
      render: (n) => <span className="tabular-nums">{n}</span>,
    },
    {
      title: "Amount spent",
      width: 150,
      align: "right",
      render: (_, row) => <span className="font-medium tabular-nums">{formatCurrency(row.totalSpent)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={loading ? " " : `${total} ${total === 1 ? "customer" : "customers"}${q ? " match" : ""}`}
        actions={
          <Button type="primary" icon={<Plus size={15} aria-hidden="true" />} onClick={() => setModalOpen(true)}>
            Add customer
          </Button>
        }
      />

      <ListCard
        toolbar={
          <SearchInput
            placeholder="Search name or email"
            onSearch={(v) => {
              setPage(1);
              setQ(v);
            }}
          />
        }
      >
        <Table
          rowKey="id"
          scroll={{ x: "max-content" }}
          loading={loading}
          columns={columns}
          dataSource={customers}
          rowClassName="oy-row-link"
          onRow={(row) => ({ onClick: () => router.push(`/admin/customers/${row.id}`) })}
          pagination={total > pageSize && { current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: q ? (
              <EmptyState icon={<Search />} title="No customers match" description="Try a different name or email." />
            ) : (
              <EmptyState
                icon={<Users />}
                title="No customers yet"
                description="Customers appear here automatically when they place an order. You can also add one yourself."
                actionLabel="Add customer"
                onAction={() => setModalOpen(true)}
              />
            ),
          }}
        />
      </ListCard>

      <Modal
        title="Add customer"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Add customer"
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form layout="vertical" form={form} onFinish={handleCreate} requiredMark={false} className="mt-4">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name is required" }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input inputMode="tel" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
