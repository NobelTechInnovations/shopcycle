"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Table, Button, Modal, Radio, InputNumber, Select, Input, Drawer, Skeleton, App } from "antd";
import { Boxes, Search, History, SlidersHorizontal } from "lucide-react";
import { PageHeader, EmptyState, ListCard, SearchInput, Thumb } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const REASONS = [
  { value: "received", label: "Received new stock" },
  { value: "correction", label: "Stock count correction" },
  { value: "damaged", label: "Damaged or lost" },
  { value: "returned", label: "Customer return" },
];

const REASON_LABEL = {
  received: "Received",
  correction: "Correction",
  damaged: "Damaged",
  returned: "Returned",
  sold: "Sold",
  order_cancelled: "Order cancelled",
  import: "CSV import",
};

function when(iso) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function StockCell({ qty, threshold }) {
  const tone = qty <= 0 ? "text-status-danger" : qty <= threshold ? "text-status-warning" : "text-ink";
  return (
    <span className={`font-semibold tabular-nums ${tone}`}>
      {qty}
      {qty < 0 && <span className="block text-[11px] font-normal">backordered</span>}
    </span>
  );
}

export default function InventoryPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ low: 0, out: 0 });
  const [threshold, setThreshold] = useState(5);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [adjusting, setAdjusting] = useState(null);
  const [mode, setMode] = useState("add");
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState("received");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter, page: String(page), pageSize: String(pageSize) });
      if (q) params.set("q", q);
      const data = await apiFetch(`/api/inventory?${params}`);
      setRows(data.variants);
      setTotal(data.total);
      setCounts(data.counts);
      setThreshold(data.threshold);
    } finally {
      setLoading(false);
    }
  }, [filter, q, page]);

  useEffect(() => {
    load();
  }, [load]);

  function openAdjust(row) {
    setAdjusting(row);
    setMode("add");
    setQuantity(0);
    setReason("received");
    setNote("");
  }

  async function saveAdjust() {
    setSaving(true);
    try {
      const { inventoryQuantity } = await apiFetch("/api/inventory/adjust", {
        method: "POST",
        body: { variantId: adjusting.id, mode, quantity, reason, note: note || null },
      });
      message.success(`${adjusting.productTitle}: ${inventoryQuantity} in stock`);
      setAdjusting(null);
      load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(row) {
    setHistoryFor(row);
    setHistory(null);
    try {
      setHistory(await apiFetch(`/api/inventory/${row.id}/history`));
    } catch (err) {
      message.error(err.message);
      setHistoryFor(null);
    }
  }

  const after = adjusting ? (mode === "set" ? quantity : adjusting.inventoryQuantity + (quantity || 0)) : 0;

  const columns = [
    {
      title: "Product",
      render: (_, row) => (
        <div className="flex items-center gap-3 min-w-0">
          <Thumb src={row.image} icon={<Boxes size={16} strokeWidth={1.75} aria-hidden="true" />} />
          <div className="min-w-0">
            <Link href={`/admin/products/${row.productId}`} className="font-medium text-ink hover:underline block truncate">
              {row.productTitle}
            </Link>
            <span className="text-xs text-ink-muted">
              {row.title !== "Default" ? row.title : "Default"}
              {row.productStatus === "draft" ? " · draft" : ""}
            </span>
          </div>
        </div>
      ),
    },
    {
      title: "SKU",
      responsive: ["md"],
      dataIndex: "sku",
      width: 150,
      render: (v) => <span className="text-[13px] text-ink-muted font-mono">{v || "—"}</span>,
    },
    {
      title: "In stock",
      width: 110,
      align: "right",
      render: (_, row) => <StockCell qty={row.inventoryQuantity} threshold={threshold} />,
    },
    {
      title: "",
      width: 190,
      align: "right",
      render: (_, row) => (
        <div className="flex justify-end gap-1">
          <Button size="small" type="text" icon={<History size={14} aria-hidden="true" />} onClick={() => openHistory(row)}>
            History
          </Button>
          <Button size="small" icon={<SlidersHorizontal size={14} aria-hidden="true" />} onClick={() => openAdjust(row)}>
            Adjust
          </Button>
        </div>
      ),
    },
  ];

  const tabs = [
    { key: "all", label: "All" },
    { key: "low", label: "Low stock", count: counts.low },
    { key: "out", label: "Out of stock", count: counts.out },
  ];

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={loading ? " " : `${total} variant${total === 1 ? "" : "s"} · low stock means ${threshold} or fewer`}
      />

      <ListCard
        tabs={tabs}
        activeTab={filter}
        onTabChange={(key) => {
          setPage(1);
          setFilter(key);
        }}
        toolbar={
          <SearchInput
            placeholder="Product, variant or SKU"
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
          dataSource={rows}
          pagination={total > pageSize && { current: page, pageSize, total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: q ? (
              <EmptyState icon={<Search />} title="Nothing matches" description="Try a different product name or SKU." />
            ) : filter !== "all" ? (
              <EmptyState icon={<Boxes />} title={filter === "out" ? "Nothing is out of stock" : "Nothing is running low"} description="Nice — stock looks healthy." />
            ) : (
              <EmptyState icon={<Boxes />} title="No products yet" description="Add products to track their stock here." />
            ),
          }}
        />
      </ListCard>

      <Modal
        open={Boolean(adjusting)}
        onCancel={() => setAdjusting(null)}
        title={adjusting ? `Adjust stock · ${adjusting.productTitle}${adjusting.title !== "Default" ? ` (${adjusting.title})` : ""}` : ""}
        okText="Save"
        okButtonProps={{ loading: saving, disabled: mode === "add" ? !quantity : quantity === null }}
        onOk={saveAdjust}
        destroyOnHidden
      >
        {adjusting && (
          <div className="mt-3 flex flex-col gap-4">
            <Radio.Group
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                setQuantity(e.target.value === "set" ? adjusting.inventoryQuantity : 0);
                setReason(e.target.value === "set" ? "correction" : "received");
              }}
              optionType="button"
              options={[
                { value: "add", label: "Add or remove" },
                { value: "set", label: "Set exact count" },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[13px] font-medium text-ink mb-1">{mode === "add" ? "Change (use − to remove)" : "New count"}</span>
                <InputNumber className="w-full" value={quantity} onChange={(v) => setQuantity(v ?? 0)} precision={0} />
              </label>
              <div className="rounded-lg bg-app-bg px-3 py-2">
                <span className="block text-xs text-ink-muted">Stock after</span>
                <span className="text-lg font-semibold tabular-nums">
                  {adjusting.inventoryQuantity} → {after}
                </span>
              </div>
            </div>
            <label className="block">
              <span className="block text-[13px] font-medium text-ink mb-1">Reason</span>
              <Select className="w-full" value={reason} onChange={setReason} options={REASONS} />
            </label>
            <label className="block">
              <span className="block text-[13px] font-medium text-ink mb-1">Note (optional)</span>
              <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Invoice #4471 from supplier" />
            </label>
          </div>
        )}
      </Modal>

      <Drawer
        open={Boolean(historyFor)}
        onClose={() => setHistoryFor(null)}
        title={historyFor ? `${historyFor.productTitle}${historyFor.title !== "Default" ? ` · ${historyFor.title}` : ""}` : ""}
        width={420}
      >
        {!history ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : history.history.length === 0 ? (
          <p className="text-sm text-ink-muted">No stock changes recorded yet.</p>
        ) : (
          <>
            <p className="text-sm text-ink-muted mt-0 mb-4">
              In stock now: <strong className="text-ink tabular-nums">{history.variant.inventoryQuantity}</strong>
            </p>
            <ol className="list-none p-0 m-0">
              {history.history.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 py-3 border-b border-app-border last:border-0">
                  <div className="min-w-0">
                    <p className="m-0 text-sm text-ink">
                      {REASON_LABEL[h.reason] || h.reason}
                      {h.orderNumber && (
                        <>
                          {" · "}
                          <Link href={`/admin/orders/${h.orderId}`} className="underline">
                            #{h.orderNumber}
                          </Link>
                        </>
                      )}
                    </p>
                    <p className="m-0 text-xs text-ink-muted">
                      {when(h.createdAt)}
                      {h.actorName ? ` · ${h.actorName}` : ""}
                      {h.note ? ` · ${h.note}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`block text-sm font-semibold tabular-nums ${h.delta > 0 ? "text-status-success" : "text-status-danger"}`}>
                      {h.delta > 0 ? `+${h.delta}` : h.delta}
                    </span>
                    <span className="block text-xs text-ink-muted tabular-nums">→ {h.quantityAfter}</span>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </Drawer>
    </div>
  );
}
