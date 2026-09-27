"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, InputNumber, Input, Checkbox, Alert, App } from "antd";
import { Undo2 } from "lucide-react";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";
import { round2, suggestedRefund } from "./order-utils";

/**
 * Refund some items and/or an amount. The amount starts at what the chosen
 * items were worth (discount and tax included) and can be changed.
 * `preset` pre-selects items — used when refunding a received return.
 */
export function RefundModal({ order, open, onClose, onDone, preset }) {
  const { message } = App.useApp();
  const refundableItems = useMemo(() => order.items.filter((i) => (order.quantities[i.id]?.refundable || 0) > 0), [order]);
  const [qty, setQty] = useState({});
  const [amount, setAmount] = useState(0);
  const [amountTouched, setAmountTouched] = useState(false);
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(false);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  const max = round2(order.refundable);
  const online = order.paymentMethod === "razorpay" && order.razorpayPaymentId;
  const toCard = Math.min(amount || 0, order.giftCard?.refundable || 0);

  useEffect(() => {
    if (!open) return;
    const initial = Object.fromEntries(refundableItems.map((i) => [i.id, 0]));
    for (const p of preset?.items || []) initial[p.orderItemId] = p.quantity;
    setQty(initial);
    setAmountTouched(false);
    setReason(preset?.reason || "");
    setRestock(false);
    setNotify(true);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const selection = Object.entries(qty)
    .map(([orderItemId, quantity]) => ({ orderItemId, quantity: Number(quantity) || 0 }))
    .filter((s) => s.quantity > 0);

  useEffect(() => {
    if (!amountTouched) setAmount(Math.min(suggestedRefund(order, selection), max));
  }, [JSON.stringify(selection), amountTouched]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setSaving(true);
    try {
      await apiFetch(`/api/orders/${order.id}/refunds`, {
        method: "POST",
        body: { items: selection, amount, reason: reason || null, restock: restock && selection.length > 0, notify, returnId: preset?.returnId },
      });
      message.success(`Refunded ${formatCurrency(amount, order.currency)}`);
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
          <Undo2 size={18} aria-hidden="true" /> Refund
        </span>
      }
      okText={`Refund ${formatCurrency(amount || 0, order.currency)}`}
      okButtonProps={{ disabled: !(amount > 0) || amount > max, loading: saving, danger: true }}
      onOk={submit}
      width={560}
      destroyOnHidden
    >
      <Alert
        className="mt-3"
        type={online || order.paymentMethod === "gift_card" ? "info" : "warning"}
        showIcon
        message={
          <>
            {toCard > 0 && (
              <>
                {formatCurrency(toCard, order.currency)} goes back onto gift card ••••{order.giftCard.last4} first.
                {(amount || 0) - toCard > 0 ? " The rest: " : ""}
              </>
            )}
            {(amount || 0) - toCard > 0 || !(toCard > 0)
              ? online
                ? "This goes back to the customer's original payment method through Razorpay, usually within 5–7 business days."
                : order.paymentMethod === "gift_card"
                  ? "This goes back onto the gift card the order was paid with."
                  : ["cashfree", "payu", "stripe", "paypal"].includes(order.paymentMethod)
                    ? `This records the refund. Send the money back from your ${{ cashfree: "Cashfree", payu: "PayU", stripe: "Stripe", paypal: "PayPal" }[order.paymentMethod]} dashboard.`
                    : "Cash on delivery: this records the refund. Pay the customer back yourself (UPI or bank transfer)."
              : null}
          </>
        }
      />

      {refundableItems.length > 0 && (
        <div className="flex flex-col gap-2 mt-4">
          {refundableItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-app-border px-3 py-2.5">
              <div className="min-w-0">
                <p className="m-0 text-sm font-medium text-ink truncate">{item.title}</p>
                <p className="m-0 text-xs text-ink-muted tabular-nums">
                  {formatCurrency(item.price, order.currency)} × up to {order.quantities[item.id].refundable}
                </p>
              </div>
              <InputNumber
                aria-label={`Quantity of ${item.title} to refund`}
                min={0}
                max={order.quantities[item.id].refundable}
                value={qty[item.id]}
                onChange={(v) => setQty((q) => ({ ...q, [item.id]: v ?? 0 }))}
                className="w-24"
              />
            </div>
          ))}
          <Checkbox className="mt-1" checked={restock} disabled={!selection.length} onChange={(e) => setRestock(e.target.checked)}>
            Put these items back in stock
          </Checkbox>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
        <label className="block">
          <span className="block text-[13px] font-medium text-ink mb-1">Amount</span>
          <InputNumber
            className="w-full"
            prefix="₹"
            min={0}
            max={max}
            precision={2}
            value={amount}
            onChange={(v) => {
              setAmountTouched(true);
              setAmount(v ?? 0);
            }}
          />
          <span className="block text-xs text-ink-muted mt-1 tabular-nums">Up to {formatCurrency(max, order.currency)} can be refunded</span>
        </label>
        <label className="block">
          <span className="block text-[13px] font-medium text-ink mb-1">Reason</span>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Damaged in transit" />
          <span className="block text-xs text-ink-muted mt-1">Shown to the customer</span>
        </label>
      </div>
      <Checkbox className="mt-4" checked={notify} onChange={(e) => setNotify(e.target.checked)}>
        Email the customer about this refund
      </Checkbox>
    </Modal>
  );
}
