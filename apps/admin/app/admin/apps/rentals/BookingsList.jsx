"use client";

import { useEffect, useState } from "react";
import { App, Input, Select, Table } from "antd";
import { Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { StatusTag, DEPOSIT, rupees, dayLabel } from "./shared";

const FILTERS = [
  { value: "", label: "All bookings" },
  { value: "requested", label: "Requests" },
  { value: "confirmed", label: "Booked" },
  { value: "out", label: "With customer" },
  { value: "late", label: "Late" },
  { value: "returned", label: "Returned" },
  { value: "cancelled", label: "Cancelled" },
  { value: "blocked", label: "Blocked dates" },
];

/** Every booking, newest dates first, with a status filter and search. */
export function BookingsList({ version, onOpen }) {
  const { message } = App.useApp();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (status) params.set("status", status);
    if (term) params.set("q", term);
    apiFetch(`/api/rentals/bookings?${params}`)
      .then(setData)
      .catch((err) => message.error(err.message));
  }, [status, term, page, version, message]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={FILTERS} className="w-[180px]" />
        <Input
          allowClear
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Name, phone, email or product"
          prefix={<Search size={14} className="text-ink-subtle" aria-hidden="true" />}
          className="max-w-[320px]"
        />
      </div>
      <Table
        rowKey="id"
        size="middle"
        loading={!data}
        dataSource={data?.bookings || []}
        scroll={{ x: 760 }}
        onRow={(b) => ({ onClick: () => onOpen(b.id), className: "cursor-pointer" })}
        pagination={{ current: page, pageSize: 50, total: data?.total || 0, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true }}
        locale={{ emptyText: "No bookings yet." }}
        columns={[
          { title: "Dates", key: "dates", width: 150, render: (_, b) => <span className="whitespace-nowrap">{dayLabel(b.startDate)} → {dayLabel(b.endDate)}<br /><span className="text-ink-muted text-[12px]">{b.days} day{b.days === 1 ? "" : "s"}</span></span> },
          { title: "Item", dataIndex: "title", key: "title", render: (t, b) => <span>{t}{b.quantity > 1 && <span className="text-ink-muted"> × {b.quantity}</span>}</span> },
          { title: "Customer", key: "customer", render: (_, b) => (b.status === "blocked" ? <span className="text-ink-muted">—</span> : <span>{b.customerName || "—"}<br /><span className="text-ink-muted text-[12px]">{b.phone}</span></span>) },
          { title: "Status", key: "status", width: 140, render: (_, b) => <StatusTag booking={b} /> },
          { title: "Rent", key: "rent", width: 110, align: "right", render: (_, b) => (b.status === "blocked" ? "—" : rupees(b.rentalTotal)) },
          { title: "Deposit", key: "deposit", width: 150, render: (_, b) => (b.deposit > 0 ? <span>{rupees(b.deposit)}<br /><span className="text-ink-muted text-[12px]">{DEPOSIT[b.depositStatus]}</span></span> : <span className="text-ink-muted">—</span>) },
          { title: "From", key: "source", width: 110, render: (_, b) => (b.order ? `Order #${b.order.orderNumber}` : b.source === "request" ? "Request" : b.source === "block" ? "Blocked" : "Added by you") },
        ]}
      />
    </div>
  );
}
