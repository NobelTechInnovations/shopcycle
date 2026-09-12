"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Table, Input, Tag } from "antd";
import { Search } from "lucide-react";
import { PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

/**
 * Every shopper's identity across every store on the platform (see
 * PlatformCustomer's doc comment in schema.prisma) — this is the
 * cross-store view a store's own admin never gets, meant for platform-
 * level marketing (the way GoKwik/Shiprocket's own checkout networks use
 * shared shopper data across the merchants they run checkout for).
 */
export default function PlatformCustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async (query) => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/super-admin/platform-customers?q=${encodeURIComponent(query || "")}`);
      setCustomers(data.customers);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  return (
    <div>
      <PageHeader title="Customers" />
      <p className="text-sm text-ink-muted -mt-4 mb-4 max-w-2xl">
        Every shopper across every store on the platform, unified by phone number. Use this for platform-wide
        marketing — a store's own admin only ever sees its own customers.
      </p>
      <Card size="small">
        <Input.Search
          placeholder="Search by phone, email, or name"
          allowClear
          prefix={<Search size={14} className="text-ink-muted" aria-hidden="true" />}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onSearch={load}
          className="mb-3 max-w-sm"
        />
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={customers}
          pagination={{ total, pageSize: 25, showSizeChanger: false }}
          columns={[
            { title: "Name", dataIndex: "name", render: (v, row) => <Link href={`/customers/${row.id}`}>{v || "—"}</Link> },
            { title: "Phone", dataIndex: "phone", render: (v) => v || "—" },
            { title: "Email", dataIndex: "email", render: (v) => v || "—" },
            {
              title: "Stores",
              dataIndex: "stores",
              render: (stores) => (
                <div className="flex flex-wrap gap-1">
                  {stores.map((s) => (
                    <Tag key={s.storeId}>{s.storeName}</Tag>
                  ))}
                </div>
              ),
            },
            { title: "First seen", dataIndex: "createdAt", render: (v) => new Date(v).toLocaleDateString() },
          ]}
        />
      </Card>
    </div>
  );
}
