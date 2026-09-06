"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Input, Button, Modal, Form } from "antd";
import { Plus, Users } from "lucide-react";
import { PageHeader, EmptyState } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
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
    await apiFetch("/api/customers", { method: "POST", body: values });
    setModalOpen(false);
    form.resetFields();
    load();
  }

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      render: (name, row) => <Link href={`/admin/customers/${row.id}`}>{name}</Link>,
    },
    { title: "Email", dataIndex: "email" },
    { title: "Orders", dataIndex: "orderCount" },
    { title: "Total spent", render: (_, row) => formatCurrency(row.totalSpent) },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        actions={
          <Button type="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={() => setModalOpen(true)}>
            Add customer
          </Button>
        }
      />

      <div className="mb-4">
        <Input.Search
          placeholder="Search customers"
          allowClear
          className="max-w-xs"
          onSearch={(v) => {
            setPage(1);
            setQ(v);
          }}
        />
      </div>

      <div className="bg-app-surface border border-app-border rounded-md">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={customers}
          pagination={{ current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: (
              <EmptyState
                icon={<Users size={32} strokeWidth={1.5} />}
                title="No customers yet"
                description="Customers appear here automatically once they place an order, or you can add one manually."
                actionLabel="Add customer"
                onAction={() => setModalOpen(true)}
              />
            ),
          }}
        />
      </div>

      <Modal
        title="Add customer"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Add customer"
        destroyOnHidden
      >
        <Form layout="vertical" form={form} onFinish={handleCreate} requiredMark={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name is required" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
