"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, message } from "antd";
import { apiFetch } from "@/lib/api";

export function OrderStatusControls({ order }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function update(field, value) {
    setSaving(true);
    try {
      await apiFetch(`/api/orders/${order.id}/status`, { method: "PATCH", body: { [field]: value } });
      router.refresh();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs text-ink-muted mb-1">Payment status</p>
        <Select
          className="w-full"
          disabled={saving}
          value={order.paymentStatus}
          onChange={(v) => update("paymentStatus", v)}
          options={[
            { value: "pending", label: "Pending" },
            { value: "paid", label: "Paid" },
            { value: "refunded", label: "Refunded" },
          ]}
        />
      </div>
      <div>
        <p className="text-xs text-ink-muted mb-1">Fulfillment status</p>
        <Select
          className="w-full"
          disabled={saving}
          value={order.fulfillmentStatus}
          onChange={(v) => update("fulfillmentStatus", v)}
          options={[
            { value: "unfulfilled", label: "Unfulfilled" },
            { value: "fulfilled", label: "Fulfilled" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
      </div>
    </div>
  );
}
