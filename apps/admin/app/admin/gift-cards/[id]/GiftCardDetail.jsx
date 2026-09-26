"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Modal, InputNumber, Input, Segmented, App } from "antd";
import { Gift, Ban, RotateCcw, SlidersHorizontal } from "lucide-react";
import { PageHeader, StatusBadge, useConfirmDialog } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";
import { cardState, CARD_STATE_BADGE, dateLabel } from "../gift-card-state";

const KIND_LABEL = {
  issued: "Issued",
  redeemed: "Spent on order",
  refunded: "Refunded from order",
  adjusted: "Balance adjusted",
};

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="text-ink text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

export function GiftCardDetail({ card, canManage }) {
  const router = useRouter();
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [adjusting, setAdjusting] = useState(false);
  const [direction, setDirection] = useState("add");
  const [amount, setAmount] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const badge = CARD_STATE_BADGE[cardState(card)];
  const currency = card.currency || "INR";

  async function patch(body, done) {
    setSaving(true);
    try {
      await apiFetch(`/api/gift-cards/${card.id}`, { method: "PATCH", body });
      message.success(done);
      router.refresh();
      return true;
    } catch (err) {
      message.error(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function toggleStatus() {
    if (card.status === "active") {
      confirmDialog({
        title: "Disable this gift card?",
        description: `The ${formatCurrency(card.balance, currency)} left on it can't be spent until you enable it again.`,
        okText: "Disable",
        danger: true,
        onConfirm: () => patch({ status: "disabled" }, "Gift card disabled"),
      });
    } else {
      patch({ status: "active" }, "Gift card enabled");
    }
  }

  async function saveAdjustment() {
    const delta = direction === "add" ? amount : -amount;
    const ok = await patch({ adjustment: delta, note: note || null }, "Balance updated");
    if (ok) {
      setAdjusting(false);
      setAmount(null);
      setNote("");
    }
  }

  const spent = Math.max(0, Number(card.initialValue) - Number(card.balance));
  const pct = Number(card.initialValue) > 0 ? Math.min(100, (Number(card.balance) / Number(card.initialValue)) * 100) : 0;

  return (
    <div>
      <PageHeader
        title={`Gift card •••• ${card.last4}`}
        backHref="/admin/gift-cards"
        meta={<StatusBadge status={badge.status} label={badge.label} />}
        actions={
          canManage && (
            <div className="flex gap-2">
              <Button icon={<SlidersHorizontal size={14} aria-hidden="true" />} onClick={() => setAdjusting(true)}>
                Adjust balance
              </Button>
              <Button
                danger={card.status === "active"}
                icon={card.status === "active" ? <Ban size={14} aria-hidden="true" /> : <RotateCcw size={14} aria-hidden="true" />}
                loading={saving && !adjusting}
                onClick={toggleStatus}
              >
                {card.status === "active" ? "Disable" : "Enable"}
              </Button>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
          <Card size="small">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="m-0 text-xs uppercase tracking-wider text-ink-muted">Balance</p>
                <p className="m-0 mt-1 text-3xl font-semibold text-ink tabular-nums">{formatCurrency(card.balance, currency)}</p>
              </div>
              <p className="m-0 text-sm text-ink-muted tabular-nums">
                {formatCurrency(spent, currency)} used of {formatCurrency(card.initialValue, currency)}
              </p>
            </div>
            <div className="mt-4 h-2 rounded-full bg-app-bg overflow-hidden" role="presentation">
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
          </Card>

          <Card size="small" title="History">
            <ul className="m-0 p-0 list-none divide-y divide-app-border">
              {card.transactions.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-medium text-ink">
                      {KIND_LABEL[t.kind] || t.kind}
                      {t.orderNumber && (
                        <>
                          {" "}
                          <Link href={`/admin/orders/${t.orderId}`} className="text-ink hover:underline">
                            #{t.orderNumber}
                          </Link>
                        </>
                      )}
                    </p>
                    <p className="m-0 text-xs text-ink-muted">
                      {new Date(t.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      {t.actorName ? ` · ${t.actorName}` : ""}
                      {t.note ? ` · ${t.note}` : ""}
                    </p>
                  </div>
                  <span className={`text-sm font-medium tabular-nums whitespace-nowrap ${t.amount < 0 ? "text-ink" : "text-[#15703A]"}`}>
                    {t.amount < 0 ? "−" : "+"}
                    {formatCurrency(Math.abs(t.amount), currency)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-6 min-w-0">
          <Card size="small" title={<span className="flex items-center gap-2"><Gift size={15} aria-hidden="true" /> Details</span>}>
            <Row label="Code">
              <span className="tabular-nums whitespace-nowrap tracking-wider">•••• {card.last4}</span>
            </Row>
            <Row label="Issued">{dateLabel(card.createdAt)}</Row>
            {card.createdBy && <Row label="Issued by">{card.createdBy}</Row>}
            <Row label="Expires">{card.expiresAt ? dateLabel(card.expiresAt) : "Never"}</Row>
            {card.note && <Row label="Note">{card.note}</Row>}
          </Card>
          {(card.recipientName || card.recipientEmail) && (
            <Card size="small" title="Recipient">
              {card.recipientName && <p className="m-0 text-sm font-medium text-ink">{card.recipientName}</p>}
              {card.recipientEmail && <p className="m-0 text-sm text-ink-muted break-all">{card.recipientEmail}</p>}
            </Card>
          )}
          <p className="text-xs text-ink-muted m-0 px-1">
            The full code was shown once when the card was issued. If a customer lost it, disable this card and issue a new one for the remaining balance.
          </p>
        </div>
      </div>

      <Modal
        open={adjusting}
        onCancel={() => setAdjusting(false)}
        title="Adjust balance"
        okText="Save"
        okButtonProps={{ disabled: !(amount > 0) || (direction === "remove" && amount > Number(card.balance)), loading: saving }}
        onOk={saveAdjustment}
        destroyOnHidden
      >
        <div className="flex flex-col gap-4 mt-3">
          <Segmented
            block
            value={direction}
            onChange={setDirection}
            options={[
              { value: "add", label: "Add money" },
              { value: "remove", label: "Remove money" },
            ]}
          />
          <InputNumber className="!w-full" min={1} max={direction === "remove" ? Number(card.balance) : 1000000} prefix="₹" value={amount} onChange={setAmount} />
          <Input.TextArea rows={2} maxLength={500} placeholder="Reason (only staff see this)" value={note} onChange={(e) => setNote(e.target.value)} />
          {amount > 0 && (
            <p className="m-0 text-sm text-ink-muted tabular-nums">
              New balance: {formatCurrency(Number(card.balance) + (direction === "add" ? amount : -amount), currency)}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
