"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, InputNumber, Input, App } from "antd";
import { RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api";

/** Opens a return on the customer's behalf (e.g. they called the store).
 * It starts approved; receive it and refund from the order page. */
export function ReturnModal({ order, open, onClose, onDone }) {
  const { message } = App.useApp();
  const returnable = useMemo(() => order.items.filter((i) => (order.quantities[i.id]?.returnable || 0) > 0), [order]);
  const [qty, setQty] = useState({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQty(Object.fromEntries(returnable.map((i) => [i.id, 0])));
    setReason("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = Object.entries(qty)
    .map(([orderItemId, quantity]) => ({ orderItemId, quantity: Number(quantity) || 0 }))
    .filter((i) => i.quantity > 0);

  async function submit() {
    setSaving(true);
    try {
      await apiFetch(`/api/orders/${order.id}/returns`, { method: "POST", body: { items, reason: reason || null } });
      message.success("Return opened");
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
          <RotateCcw size={18} aria-hidden="true" /> Start a return
        </span>
      }
      okText="Open return"
      okButtonProps={{ disabled: !items.length, loading: saving }}
      onOk={submit}
      destroyOnHidden
    >
      <div className="flex flex-col gap-2 mt-3">
        {returnable.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-app-border px-3 py-2.5">
            <div className="min-w-0">
              <p className="m-0 text-sm font-medium text-ink truncate">{item.title}</p>
              <p className="m-0 text-xs text-ink-muted">{order.quantities[item.id].returnable} shipped and returnable</p>
            </div>
            <InputNumber
              aria-label={`Quantity of ${item.title} to return`}
              min={0}
              max={order.quantities[item.id].returnable}
              value={qty[item.id]}
              onChange={(v) => setQty((q) => ({ ...q, [item.id]: v ?? 0 }))}
              className="w-24"
            />
          </div>
        ))}
      </div>
      <label className="block mt-4">
        <span className="block text-[13px] font-medium text-ink mb-1">Reason</span>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Wrong size" />
      </label>
      <p className="text-xs text-ink-muted mt-3 mb-0">The customer gets an email that the return is approved.</p>
    </Modal>
  );
}
