"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, InputNumber, Select, Input, Checkbox, App } from "antd";
import { Truck } from "lucide-react";
import { apiFetch } from "@/lib/api";

/** Marks some or all remaining items as shipped, with courier and tracking. */
export function FulfillModal({ order, open, onClose, onDone }) {
  const { message } = App.useApp();
  const waiting = useMemo(() => order.items.filter((i) => (order.quantities[i.id]?.toFulfill || 0) > 0), [order]);
  const [qty, setQty] = useState({});
  const [couriers, setCouriers] = useState([]);
  const [courier, setCourier] = useState();
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQty(Object.fromEntries(waiting.map((i) => [i.id, order.quantities[i.id].toFulfill])));
    setCourier(undefined);
    setTrackingNumber("");
    setTrackingUrl("");
    setNotify(true);
    if (!couriers.length) apiFetch("/api/orders/couriers").then((d) => setCouriers(d.couriers)).catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = Object.values(qty).reduce((n, v) => n + (Number(v) || 0), 0);
  const selected = couriers.find((c) => c.name === courier);

  async function submit() {
    setSaving(true);
    try {
      await apiFetch(`/api/orders/${order.id}/fulfillments`, {
        method: "POST",
        body: {
          items: Object.entries(qty).map(([orderItemId, quantity]) => ({ orderItemId, quantity: Number(quantity) || 0 })),
          courier: courier || null,
          trackingNumber: trackingNumber || null,
          trackingUrl: trackingUrl || null,
          notify,
        },
      });
      message.success(`${count} item${count === 1 ? "" : "s"} marked as shipped`);
      onDone();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <span className="flex items-center gap-2">
          <Truck size={18} aria-hidden="true" /> Ship items
        </span>
      }
      okText={`Ship ${count} item${count === 1 ? "" : "s"}`}
      okButtonProps={{ disabled: count === 0, loading: saving }}
      onOk={submit}
      width={560}
      destroyOnHidden
    >
      <div className="flex flex-col gap-2 mt-3">
        {waiting.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-app-border px-3 py-2.5">
            <div className="min-w-0">
              <p className="m-0 text-sm font-medium text-ink truncate">{item.title}</p>
              <p className="m-0 text-xs text-ink-muted">{order.quantities[item.id].toFulfill} waiting to ship{item.sku ? ` · SKU ${item.sku}` : ""}</p>
            </div>
            <InputNumber
              aria-label={`Quantity of ${item.title} to ship`}
              min={0}
              max={order.quantities[item.id].toFulfill}
              value={qty[item.id]}
              onChange={(v) => setQty((q) => ({ ...q, [item.id]: v ?? 0 }))}
              className="w-24"
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
        <label className="block">
          <span className="block text-[13px] font-medium text-ink mb-1">Courier</span>
          <Select
            className="w-full"
            placeholder="Choose courier"
            allowClear
            showSearch
            value={courier}
            onChange={setCourier}
            options={couriers.map((c) => ({ value: c.name, label: c.name }))}
          />
        </label>
        <label className="block">
          <span className="block text-[13px] font-medium text-ink mb-1">Tracking number (AWB)</span>
          <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="e.g. 1234567890" />
        </label>
      </div>
      <label className="block mt-3">
        <span className="block text-[13px] font-medium text-ink mb-1">Tracking link</span>
        <Input
          value={trackingUrl}
          onChange={(e) => setTrackingUrl(e.target.value)}
          placeholder={selected?.autoTracking ? "Filled in automatically from the tracking number" : "https://…"}
        />
        <span className="block text-xs text-ink-muted mt-1">
          {selected?.autoTracking
            ? `Leave blank — we'll link to ${selected.name}'s tracking page.`
            : "Optional. Paste the courier's tracking page so the customer can follow the package."}
        </span>
      </label>
      <Checkbox className="mt-4" checked={notify} onChange={(e) => setNotify(e.target.checked)}>
        Email the customer a shipping confirmation
      </Checkbox>
    </Modal>
  );
}
