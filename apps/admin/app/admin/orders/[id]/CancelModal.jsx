"use client";

import { useEffect, useState } from "react";
import { Modal, Select, Checkbox, App } from "antd";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";
import { CANCEL_REASONS } from "./order-utils";

/** Cancels an order that hasn't shipped: restock, refund, tell the customer. */
export function CancelModal({ order, open, onClose, onDone, canRefund }) {
  const { message } = App.useApp();
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [restock, setRestock] = useState(true);
  const [refund, setRefund] = useState(true);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  const paid = ["paid", "partially_refunded"].includes(order.paymentStatus) && order.refundable > 0;

  useEffect(() => {
    if (!open) return;
    setReason(CANCEL_REASONS[0]);
    setRestock(true);
    setRefund(canRefund);
    setNotify(true);
  }, [open, canRefund]);

  async function submit() {
    setSaving(true);
    try {
      await apiFetch(`/api/orders/${order.id}/cancel`, {
        method: "POST",
        body: { reason, restock, refund: paid && refund, notify },
      });
      message.success(`Order #${order.orderNumber} cancelled`);
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
      title={`Cancel order #${order.orderNumber}?`}
      okText="Cancel order"
      cancelText="Keep order"
      okButtonProps={{ danger: true, loading: saving }}
      onOk={submit}
      destroyOnHidden
    >
      <label className="block mt-3">
        <span className="block text-[13px] font-medium text-ink mb-1">Reason</span>
        <Select className="w-full" value={reason} onChange={setReason} options={CANCEL_REASONS.map((r) => ({ value: r, label: r }))} />
      </label>
      <div className="flex flex-col gap-2 mt-4">
        <Checkbox checked={restock} onChange={(e) => setRestock(e.target.checked)}>
          Put the items back in stock
        </Checkbox>
        {paid && (
          <Checkbox checked={refund} disabled={!canRefund} onChange={(e) => setRefund(e.target.checked)}>
            Refund {formatCurrency(order.refundable, order.currency)}
            {order.giftCard?.refundable > 0
              ? " — gift card first, then the rest"
              : order.paymentMethod === "razorpay"
                ? " to the original payment method"
                : " (record it — pay the customer back yourself)"}
            {!canRefund && <span className="text-ink-muted"> · only the owner or an admin can refund</span>}
          </Checkbox>
        )}
        {!paid && order.giftCard?.refundable > 0 && (
          <p className="text-sm text-ink-muted m-0">
            {formatCurrency(order.giftCard.refundable, order.currency)} paid with gift card ••••{order.giftCard.last4} goes back onto the card.
          </p>
        )}
        <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)}>
          Email the customer that the order was cancelled
        </Checkbox>
      </div>
      <p className="text-xs text-ink-muted mt-4 mb-0">This can't be undone.</p>
    </Modal>
  );
}
