"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Table, Tag, Button, App } from "antd";
import { PageHeader, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

export default function CompaniesPage() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/super-admin/companies");
      setCompanies(data.companies);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleStatus(company) {
    const next = company.status === "active" ? "suspended" : "active";
    confirmDialog({
      title: `${next === "suspended" ? "Suspend" : "Reactivate"} ${company.name}?`,
      description:
        next === "suspended"
          ? "Their storefront and admin access will be blocked immediately."
          : "This restores their storefront and admin access.",
      okText: next === "suspended" ? "Suspend" : "Reactivate",
      danger: next === "suspended",
      onConfirm: async () => {
        try {
          await apiFetch(`/api/super-admin/companies/${company.id}/status`, { method: "PATCH", body: { status: next } });
          load();
        } catch (err) {
          message.error(err.message);
        }
      },
    });
  }

  const columns = [
    { title: "Company", dataIndex: "name" },
    { title: "Handle", dataIndex: "handle", render: (v) => <code>{v}</code> },
    { title: "Owner", render: (_, row) => row.owner?.email || "—" },
    { title: "Plan", render: (_, row) => row.plan?.name || "—" },
    { title: "Products", dataIndex: "productCount" },
    { title: "Orders", dataIndex: "orderCount" },
    {
      title: "Status",
      dataIndex: "status",
      render: (status) => <Tag color={status === "active" ? "green" : "red"}>{status}</Tag>,
    },
    {
      title: "",
      render: (_, row) => (
        <Button size="small" danger={row.status === "active"} onClick={() => toggleStatus(row)}>
          {row.status === "active" ? "Suspend" : "Reactivate"}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Companies" />
      <Card size="small">
        <Table rowKey="id" columns={columns} dataSource={companies} loading={loading} pagination={false} />
      </Card>
    </div>
  );
}
