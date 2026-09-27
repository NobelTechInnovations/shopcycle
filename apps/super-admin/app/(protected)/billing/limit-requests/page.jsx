"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { App, Button, Input, InputNumber, Modal, Segmented, Table } from "antd";
import { StatusBadge, useHasMounted } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { day } from "@/lib/billing";

/** Sellers asking for more staff accounts than their plan includes. */
export default function LimitRequestsPage() {
  const mounted = useHasMounted();
  const { message } = App.useApp();
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await apiFetch(`/api/super-admin/billing/limit-requests?status=${status}`)).requests);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, message]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide() {
    try {
      await apiFetch(`/api/super-admin/billing/limit-requests/${deciding.id}`, {
        method: "POST",
        body: { approve: deciding.approve, value: deciding.value, note: deciding.note || undefined },
      });
      message.success(deciding.approve ? "Approved — the seller has been told" : "Declined — the seller has been told");
      setDeciding(null);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  if (!mounted) return null;
  return (
    <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card">
      <div className="p-4 border-b border-app-border">
        <Segmented value={status} onChange={setStatus} options={[{ label: "Waiting", value: "pending" }, { label: "Approved", value: "approved" }, { label: "Declined", value: "rejected" }, { label: "All", value: "all" }]} />
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 760 }}
        columns={[
          { title: "Store", render: (_, r) => <Link href={`/billing/subscriptions/${r.storeId}`} className="text-ink font-medium hover:underline">{r.store.name}</Link> },
          { title: "Asked", dataIndex: "createdAt", render: day },
          { title: "Staff accounts", render: (_, r) => <span className="tabular-nums">{r.currentLimit} → <strong>{r.requested}</strong></span> },
          { title: "Why", dataIndex: "reason", render: (v) => <span className="text-[13px] text-ink-muted">{v || "—"}</span> },
          { title: "Status", dataIndex: "status", render: (s) => <StatusBadge status={s === "rejected" ? "declined" : s} /> },
          {
            title: "",
            render: (_, r) =>
              r.status === "pending" ? (
                <span className="flex gap-2">
                  <Button size="small" type="primary" onClick={() => setDeciding({ ...r, approve: true, value: r.requested })}>Approve</Button>
                  <Button size="small" onClick={() => setDeciding({ ...r, approve: false })}>Decline</Button>
                </span>
              ) : (
                <span className="text-xs text-ink-muted">{day(r.decidedAt)}{r.note ? ` · ${r.note}` : ""}</span>
              ),
          },
        ]}
      />
      <Modal open={Boolean(deciding)} title={deciding?.approve ? `Approve for ${deciding?.store?.name}` : `Decline ${deciding?.store?.name}'s request`} okText={deciding?.approve ? "Approve" : "Decline"} onOk={decide} onCancel={() => setDeciding(null)} destroyOnHidden>
        {deciding && (
          <div className="flex flex-col gap-3 mt-3">
            {deciding.approve && (
              <label className="text-sm text-ink flex items-center gap-3">
                New staff limit
                <InputNumber min={deciding.currentLimit + 1} max={10000} value={deciding.value} onChange={(v) => setDeciding({ ...deciding, value: v })} />
              </label>
            )}
            <Input.TextArea rows={2} placeholder="Note to the seller (optional)" value={deciding.note} onChange={(e) => setDeciding({ ...deciding, note: e.target.value })} />
          </div>
        )}
      </Modal>
    </div>
  );
}
