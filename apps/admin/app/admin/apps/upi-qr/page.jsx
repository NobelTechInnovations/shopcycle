"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { App, Alert, Button, Card, Form, Input, Select, Skeleton, Table, Tag, Tooltip } from "antd";
import { Check, X, QrCode, Search } from "lucide-react";
import { formatCurrency } from "@shopcycle/utils";
import { PageHeader, EmptyState, ListCard, SearchInput, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { AppNotInstalled } from "@/components/apps/AppPanelParts";

const STATUS = {
  submitted: { label: "To check", color: "gold" },
  confirmed: { label: "Received", color: "green" },
  rejected: { label: "Not received", color: "red" },
  awaiting: { label: "QR showing", color: "blue" },
  expired: { label: "Not paid", color: "default" },
};

const when = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
const inr = (n) => formatCurrency(Number(n || 0), "INR");

function duration(seconds) {
  if (seconds == null) return "—";
  const s = Math.round(seconds);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ""}`.trim();
}

/**
 * Apps ▸ UPI QR payments: where shoppers' UPI payments go, the payments
 * to check ("Received" makes the order paid and moves the shopper's QR
 * page on), and the history with its numbers.
 */
export default function UpiQrPage() {
  return (
    <Suspense fallback={<Skeleton active paragraph={{ rows: 8 }} />}>
      <UpiQr />
    </Suspense>
  );
}

function UpiQr() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const params = useSearchParams();
  const [tab, setTab] = useState("submitted");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(null);
  const highlight = params.get("payment");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status: tab, page: String(page) });
      if (q) qs.set("q", q);
      setData(await apiFetch(`/api/upi-qr?${qs}`));
    } catch (err) {
      if (err.status === 404) setMissing(true);
      else message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab, page, q, message]);

  useEffect(() => {
    load();
  }, [load]);

  const ready = Boolean(data?.settings?.upiId);
  useEffect(() => {
    if (!ready) return;
    apiFetch("/api/upi-qr/preview")
      .then((r) => setPreview(r.svg))
      .catch(() => {});
  }, [ready, data?.settings?.upiId, data?.settings?.payeeName]);

  async function act(row, kind) {
    if (kind === "reject") {
      const ok = await confirmDialog({
        title: `Mark ${inr(row.amount)} as not received?`,
        content: `Order #${row.orderNumber} is cancelled, its stock goes back, and ${row.buyerName || "the customer"} is told.`,
        okText: "Not received",
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(`${row.id}:${kind}`);
    try {
      await apiFetch(`/api/upi-qr/${row.id}/${kind}`, { method: "POST" });
      message.success(kind === "confirm" ? `Order #${row.orderNumber} is paid` : `Order #${row.orderNumber} cancelled`);
      load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (missing) return <AppNotInstalled appKey="upi-qr" title="UPI QR payments" description="Take UPI payments straight to your own UPI ID — a QR for the exact amount at checkout, no gateway and no fee." />;
  if (!data) return <Skeleton active paragraph={{ rows: 8 }} />;

  const s = data.stats;
  const counts = data.counts || {};
  const tabs = [
    { key: "submitted", label: "To check", count: counts.submitted || 0 },
    { key: "confirmed", label: "Received", count: counts.confirmed || 0 },
    { key: "rejected", label: "Not received", count: counts.rejected || 0 },
    { key: "expired", label: "Not paid", count: counts.expired || 0 },
    { key: "all", label: "All" },
  ];

  const columns = [
    {
      title: "Order",
      key: "order",
      render: (_, r) => (
        <Link href={`/admin/orders/${r.orderId}`} className="font-medium text-ink" onClick={(e) => e.stopPropagation()}>
          #{r.orderNumber}
        </Link>
      ),
    },
    {
      title: "Customer",
      key: "buyer",
      render: (_, r) => (
        <div className="min-w-[150px]">
          <div className="text-[13.5px] text-ink">{r.buyerName || "—"}</div>
          <div className="text-[12px] text-ink-muted">{r.buyerPhone || r.buyerEmail || ""}</div>
        </div>
      ),
    },
    { title: "Amount", key: "amount", render: (_, r) => <span className="font-medium tabular-nums">{inr(r.amount)}</span> },
    {
      title: "UPI reference",
      key: "utr",
      render: (_, r) => (r.utr ? <code className="text-[12.5px] tracking-wide">{r.utr}</code> : <span className="text-ink-muted text-[12.5px]">—</span>),
    },
    { title: "Status", key: "status", render: (_, r) => <Tag color={STATUS[r.status]?.color}>{STATUS[r.status]?.label || r.status}</Tag> },
    { title: "When", key: "when", render: (_, r) => <span className="text-[12.5px] text-ink-muted whitespace-nowrap">{when(r.submittedAt || r.createdAt)}</span> },
    {
      title: "",
      key: "actions",
      align: "right",
      render: (_, r) =>
        r.status === "submitted" ? (
          <div className="flex justify-end gap-1.5">
            <Button size="small" type="primary" icon={<Check size={13} aria-hidden="true" />} loading={busy === `${r.id}:confirm`} onClick={() => act(r, "confirm")}>
              Received
            </Button>
            <Button size="small" danger icon={<X size={13} aria-hidden="true" />} loading={busy === `${r.id}:reject`} onClick={() => act(r, "reject")}>
              Not received
            </Button>
          </div>
        ) : r.status === "awaiting" || r.status === "expired" ? (
          <Tooltip title="The money arrived but the customer didn't report it">
            <Button size="small" loading={busy === `${r.id}:confirm`} onClick={() => act(r, "confirm")}>
              Received
            </Button>
          </Tooltip>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader title="UPI QR payments" backHref="/admin/apps" subtitle="Shoppers pay your UPI ID by QR at checkout — no gateway, no fee. You confirm each payment arrived." />

      {!ready || editing ? (
        <SetupCard
          settings={data.settings}
          onSaved={() => {
            setEditing(false);
            load();
          }}
          onCancel={ready ? () => setEditing(false) : null}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <Stat label="Received · 30 days" value={inr(s.collected30)} />
            <Stat label="Payments received" value={s.confirmed30} />
            <Stat label="To check" value={s.toCheck} warn={s.toCheck > 0} />
            <Stat label="QRs that got paid" value={s.conversion30 == null ? "—" : `${s.conversion30}%`} hint={`${s.started30} QRs shown in 30 days`} />
            <Stat label="Typical time to pay" value={duration(s.medianSecondsToPay)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 min-w-0">
              {s.toCheck > 0 && (
                <Alert
                  className="mb-4"
                  type="warning"
                  showIcon
                  message={`${s.toCheck} payment${s.toCheck === 1 ? "" : "s"} to check`}
                  description="Find each UPI reference and amount in your UPI or bank app, then press Received. The customer's page moves on by itself."
                />
              )}
              <ListCard
                tabs={tabs}
                activeTab={tab}
                onTabChange={(k) => {
                  setTab(k);
                  setPage(1);
                }}
                toolbar={
                  <SearchInput
                    placeholder="UPI reference, name, phone"
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
                  dataSource={data.payments}
                  rowClassName={(r) => (r.id === highlight ? "bg-[#FFFBEA]" : "")}
                  pagination={data.total > data.pageSize && { current: page, pageSize: data.pageSize, total: data.total, onChange: setPage, showSizeChanger: false }}
                  locale={{
                    emptyText: q ? (
                      <EmptyState icon={<Search />} title="Nothing matches" description="Try the full 12-digit reference or the customer's phone." />
                    ) : (
                      <EmptyState icon={<QrCode />} title={tab === "submitted" ? "Nothing to check" : "No payments here yet"} description="UPI QR payments from checkout show up here." />
                    ),
                  }}
                />
              </ListCard>
            </div>

            <div className="flex flex-col gap-6 min-w-0">
              <Card size="small" title="Payments go to">
                <p className="m-0 text-[15px] font-semibold text-ink break-all">{data.settings.upiId}</p>
                <p className="m-0 text-[13px] text-ink-muted">{data.settings.payeeName} · QR valid {data.settings.minutes} min</p>
                <Button className="mt-3" size="small" onClick={() => setEditing(true)}>
                  Change
                </Button>
              </Card>
              <Card size="small" title="Test it">
                <p className="mt-0 text-[13px] text-ink-muted">Scan this ₹1 QR with your phone to check the name and UPI ID shoppers will see.</p>
                {preview ? <div className="w-44 mx-auto [&_svg]:w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: preview }} /> : <Skeleton.Image active />}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint, warn }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card px-4 py-3 min-w-0">
      <p className="m-0 text-[12px] text-ink-muted truncate">{label}</p>
      <p className={`m-0 mt-1 text-[20px] font-semibold tabular-nums ${warn ? "text-[#B45309]" : "text-ink"}`}>{value}</p>
      {hint && <p className="m-0 text-[11.5px] text-ink-muted truncate">{hint}</p>}
    </div>
  );
}

function SetupCard({ settings, onSaved, onCancel }) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);

  async function save(values) {
    setSaving(true);
    try {
      await apiFetch("/api/upi-qr/settings", { method: "PUT", body: values });
      message.success("Saved — UPI QR now shows at checkout");
      onSaved();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Where should payments go?" className="max-w-2xl">
      <p className="mt-0 text-[13px] text-ink-muted">
        Shoppers pay this UPI ID directly — Oyklane never touches the money. Since no bank tells us when it arrives, the shopper gives the UPI reference and you
        press Received once you see it.
      </p>
      <Form layout="vertical" requiredMark={false} initialValues={{ upiId: settings.upiId, payeeName: settings.payeeName, minutes: settings.minutes || 5 }} onFinish={save}>
        <Form.Item name="upiId" label="Your UPI ID" rules={[{ required: true, pattern: /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/, message: "Enter a UPI ID like yourname@okhdfcbank" }]}>
          <Input placeholder="yourname@okhdfcbank" autoComplete="off" />
        </Form.Item>
        <Form.Item name="payeeName" label="Name on the UPI account" rules={[{ required: true, min: 2, message: "Enter the account holder's name" }]} extra="Shoppers see it in their UPI app — use the name the bank shows, so they trust it.">
          <Input maxLength={60} />
        </Form.Item>
        <Form.Item name="minutes" label="QR valid for">
          <Select options={[3, 5, 10, 15].map((m) => ({ value: m, label: `${m} minutes` }))} />
        </Form.Item>
        <div className="flex gap-2">
          <Button type="primary" htmlType="submit" loading={saving}>
            Save
          </Button>
          {onCancel && <Button onClick={onCancel}>Cancel</Button>}
        </div>
      </Form>
    </Card>
  );
}
