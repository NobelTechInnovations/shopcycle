"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, Table, Descriptions } from "antd";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

export default function PlatformCustomerDetailPage() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/super-admin/platform-customers/${id}`)
      .then((data) => setCustomer(data.customer))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return null;
  if (!customer) return <p className="text-sm text-ink-muted">Not found.</p>;

  return (
    <div>
      <PageHeader title={customer.name || customer.phone || customer.email} />
      <div className="flex flex-col gap-4">
        <Card size="small" title="Identity">
          <Descriptions size="small" column={1}>
            <Descriptions.Item label="Phone">{customer.phone || "—"}</Descriptions.Item>
            <Descriptions.Item label="Email">{customer.email || "—"}</Descriptions.Item>
            <Descriptions.Item label="Stores shopped at">{customer.storeCount}</Descriptions.Item>
            <Descriptions.Item label="First seen">{new Date(customer.createdAt).toLocaleString()}</Descriptions.Item>
          </Descriptions>
        </Card>

        <Card size="small" title="Per-store history">
          <Table
            size="small"
            rowKey="customerId"
            dataSource={customer.stores}
            pagination={false}
            columns={[
              { title: "Store", dataIndex: "storeName" },
              { title: "Name on that store", dataIndex: "name" },
              { title: "Email on that store", dataIndex: "email" },
              { title: "Orders", dataIndex: "orderCount" },
              { title: "Total spent", dataIndex: "totalSpent", render: (v) => `₹${Number(v || 0).toFixed(2)}` },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
