"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Dropdown, Checkbox, Input, Alert, App } from "antd";
import {
  Truck,
  PackageCheck,
  MoreHorizontal,
  Undo2,
  ExternalLink,
  Copy,
  Mail,
  FileText,
  XCircle,
  IndianRupee,
  RotateCcw,
  Crown,
} from "lucide-react";
import { PageHeader, StatusBadge } from "@shopcycle/ui";
import { formatCurrency } from "@shopcycle/utils";
import { apiFetch } from "@/lib/api";
import { FulfillModal } from "./FulfillModal";
import { RefundModal } from "./RefundModal";
import { CancelModal } from "./CancelModal";
import { ReturnModal } from "./ReturnModal";
import { Timeline } from "./Timeline";
import { dateTime, dateOnly } from "./order-utils";

/** Where the order came from: the timeline's "placed" entry says; orders
 * from before the timeline existed fall back to having a checkout email. */
function orderSource(order) {
  const placed = order.events.find((e) => e.kind === "placed");
  if (placed) return placed.actorName === "Customer" ? "Online store" : "Created in admin";
  return order.email ? "Online store" : "Created in admin";
}

const PAYMENT_METHOD_LABEL = { cod: "Cash on delivery", razorpay: "Paid online (Razorpay)", gift_card: "Gift card" };

function SummaryRow({ label, value, strong, muted }) {
  return (
    <div className={`flex justify-between gap-4 py-1 text-sm ${strong ? "font-semibold text-ink" : ""}`}>
      <span className={muted || !strong ? "text-ink-muted" : ""}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function ItemRow({ item, quantity, currency, note }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-app-border last:border-0">
      <div className="min-w-0">
        <p className="m-0 text-sm font-medium text-ink">{item.title}</p>
        <p className="m-0 text-xs text-ink-muted">
          {item.sku ? `SKU ${item.sku} · ` : ""}
          {formatCurrency(item.price, currency)} × {quantity}
          {note ? ` · ${note}` : ""}
        </p>
      </div>
      <span className="text-sm tabular-nums text-ink shrink-0">{formatCurrency(Number(item.price) * quantity, currency)}</span>
    </div>
  );
}

function CardTitle({ icon: Icon, children, badge }) {
  return (
    <span className="flex items-center gap-2 flex-wrap">
      {Icon && <Icon size={16} className="text-ink-muted" aria-hidden="true" />}
      <span>{children}</span>
      {badge}
    </span>
  );
}

export function OrderDetailView({ order, role, hasGstInvoices }) {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const [dialog, setDialog] = useState(null); // "fulfill" | "refund" | "cancel"
  const [refundPreset, setRefundPreset] = useState(null);
  const [busy, setBusy] = useState(null);
  const [restockReturn, setRestockReturn] = useState(true);

  const canRefund = role !== "staff";
  const cancelled = Boolean(order.cancelledAt);
  const q = order.quantities;
  const waiting = order.items.filter((i) => q[i.id]?.toFulfill > 0);
  const liveShipments = order.fulfillments.filter((f) => f.status !== "cancelled");
  const paid = ["paid", "partially_refunded"].includes(order.paymentStatus);
  const codPending = order.paymentStatus === "pending" && !cancelled;
  const canCancel = !cancelled && liveShipments.length === 0;
  const refundedTotal = Number(order.refundedAmount || 0);

  function done() {
    setDialog(null);
    setRefundPreset(null);
    router.refresh();
  }

  async function run(key, fn, successText) {
    setBusy(key);
    try {
      await fn();
      if (successText) message.success(successText);
      router.refresh();
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  const markPaid = () =>
    run("paid", () => apiFetch(`/api/orders/${order.id}/mark-paid`, { method: "POST", body: {} }), "Marked as paid");

  async function copyStatusLink() {
    try {
      const { url } = await apiFetch(`/api/orders/${order.id}/status-link`);
      await navigator.clipboard.writeText(url);
      message.success("Customer's order link copied");
    } catch (err) {
      message.error(err.message || "Couldn't copy the link");
    }
  }

  async function openStatusPage(suffix = "") {
    try {
      const { url } = await apiFetch(`/api/orders/${order.id}/status-link`);
      window.open(`${url}${suffix}`, "_blank", "noopener");
    } catch (err) {
      message.error(err.message);
    }
  }

  const issueInvoice = () =>
    run(
      "invoice",
      async () => {
        const { invoiceNumber } = await apiFetch(`/api/orders/${order.id}/invoice`, { method: "POST", body: {} });
        message.success(`Invoice ${invoiceNumber} issued`);
      },
      null
    );

  const moreItems = [
    { key: "copy", icon: <Copy size={14} />, label: "Copy customer's order link", onClick: copyStatusLink },
    { key: "view", icon: <ExternalLink size={14} />, label: "View customer's order page", onClick: () => openStatusPage() },
    {
      key: "resend",
      icon: <Mail size={14} />,
      label: "Resend order confirmation",
      disabled: !order.email,
      onClick: () =>
        run("resend", () => apiFetch(`/api/orders/${order.id}/resend-confirmation`, { method: "POST", body: {} }), "Confirmation sent"),
    },
    {
      key: "return",
      icon: <RotateCcw size={14} />,
      label: "Start a return",
      disabled: cancelled || !order.items.some((i) => q[i.id]?.returnable > 0),
      onClick: () => setDialog("return"),
    },
    { type: "divider" },
    {
      key: "cancel",
      icon: <XCircle size={14} />,
      label: "Cancel order",
      danger: true,
      disabled: !canCancel,
      onClick: () => setDialog("cancel"),
    },
  ];

  function returnAction(ret, action, extra = {}) {
    const labels = { approve: "Return approved", decline: "Return declined", receive: "Return marked as received" };
    const go = (merchantNote) =>
      run(
        `${ret.id}-${action}`,
        () =>
          apiFetch(`/api/orders/${order.id}/returns/${ret.id}`, {
            method: "POST",
            body: { action, merchantNote: merchantNote || undefined, ...extra },
          }),
        labels[action]
      );
    if (action !== "decline") return go();
    let note = "";
    modal.confirm({
      title: "Decline this return?",
      content: (
        <Input.TextArea
          className="mt-2"
          placeholder="Tell the customer why (optional)"
          maxLength={500}
          onChange={(e) => {
            note = e.target.value;
          }}
        />
      ),
      okText: "Decline return",
      okButtonProps: { danger: true },
      onOk: () => go(note),
    });
    return null;
  }

  const primaryAction = cancelled ? null : waiting.length > 0 ? (
    <Button type="primary" icon={<Truck size={15} aria-hidden="true" />} onClick={() => setDialog("fulfill")}>
      Ship items
    </Button>
  ) : codPending ? (
    <Button type="primary" icon={<IndianRupee size={15} aria-hidden="true" />} loading={busy === "paid"} onClick={markPaid}>
      Mark as paid
    </Button>
  ) : null;

  return (
    <div>
      <PageHeader
        title={`Order #${order.orderNumber}`}
        backHref="/admin/orders"
        meta={
          <>
            <StatusBadge status={order.paymentStatus} />
            <StatusBadge status={order.fulfillmentStatus} />
          </>
        }
        subtitle={`Placed ${dateTime(order.createdAt)} · ${orderSource(order)}`}
        actions={
          <>
            {paid && canRefund && order.refundable > 0 && (
              <Button icon={<Undo2 size={15} aria-hidden="true" />} onClick={() => setDialog("refund")}>
                Refund
              </Button>
            )}
            <Dropdown menu={{ items: moreItems }} trigger={["click"]} placement="bottomRight">
              <Button icon={<MoreHorizontal size={16} aria-hidden="true" />} aria-label="More actions">
                <span className="hidden sm:inline">More</span>
              </Button>
            </Dropdown>
            {primaryAction}
          </>
        }
      />

      {cancelled && (
        <Alert
          className="mb-5"
          type="error"
          showIcon
          message={`Cancelled ${dateTime(order.cancelledAt)}${order.cancelReason ? ` — ${order.cancelReason}` : ""}`}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
          {waiting.length > 0 && !cancelled && (
            <Card
              size="small"
              title={<CardTitle icon={Truck} badge={<StatusBadge status="unfulfilled" label={`${waiting.reduce((n, i) => n + q[i.id].toFulfill, 0)} to ship`} />}>Unfulfilled</CardTitle>}
            >
              {waiting.map((item) => (
                <ItemRow key={item.id} item={item} quantity={q[item.id].toFulfill} currency={order.currency} />
              ))}
              <div className="flex justify-end pt-3">
                <Button type="primary" icon={<Truck size={15} aria-hidden="true" />} onClick={() => setDialog("fulfill")}>
                  Ship items
                </Button>
              </div>
            </Card>
          )}

          {order.fulfillments.map((f, index) => {
            const byId = Object.fromEntries(order.items.map((i) => [i.id, i]));
            return (
              <Card
                key={f.id}
                size="small"
                title={
                  <CardTitle icon={f.status === "delivered" ? PackageCheck : Truck} badge={<StatusBadge status={f.status} />}>
                    Shipment {index + 1}
                  </CardTitle>
                }
                extra={<span className="text-xs text-ink-muted">{dateOnly(f.shippedAt)}</span>}
              >
                {(f.courier || f.trackingNumber) && (
                  <div className="rounded-lg bg-app-bg px-3 py-2.5 mb-2 text-sm flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {f.courier && <span className="text-ink font-medium">{f.courier}</span>}
                      {f.trackingNumber && <span className="text-ink-muted"> · {f.trackingNumber}</span>}
                    </span>
                    {f.trackingUrl && (
                      <a href={f.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink underline">
                        Track <ExternalLink size={13} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                )}
                {(f.items || []).map((row) =>
                  byId[row.orderItemId] ? (
                    <ItemRow key={row.orderItemId} item={byId[row.orderItemId]} quantity={row.quantity} currency={order.currency} />
                  ) : null
                )}
                {f.status === "shipped" && (
                  <div className="flex flex-wrap justify-end gap-2 pt-3">
                    <Button
                      danger
                      type="text"
                      loading={busy === `${f.id}-cancel`}
                      onClick={() =>
                        run(
                          `${f.id}-cancel`,
                          () => apiFetch(`/api/orders/${order.id}/fulfillments/${f.id}`, { method: "POST", body: { action: "cancel" } }),
                          "Shipment cancelled"
                        )
                      }
                    >
                      Cancel shipment
                    </Button>
                    <Button
                      icon={<PackageCheck size={15} aria-hidden="true" />}
                      loading={busy === `${f.id}-delivered`}
                      onClick={() =>
                        run(
                          `${f.id}-delivered`,
                          () => apiFetch(`/api/orders/${order.id}/fulfillments/${f.id}`, { method: "POST", body: { action: "delivered" } }),
                          "Marked as delivered"
                        )
                      }
                    >
                      Mark as delivered
                    </Button>
                  </div>
                )}
                {f.status === "delivered" && <p className="text-xs text-ink-muted m-0 pt-2">Delivered {dateTime(f.deliveredAt)}</p>}
              </Card>
            );
          })}

          {order.returns.length > 0 && (
            <Card size="small" title={<CardTitle icon={RotateCcw}>Returns</CardTitle>}>
              {order.returns.map((ret) => {
                const byId = Object.fromEntries(order.items.map((i) => [i.id, i]));
                return (
                  <div key={ret.id} className="py-3 border-b border-app-border last:border-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <StatusBadge status={ret.status} />
                        <span className="text-xs text-ink-muted">
                          {ret.requestedBy === "shopper" ? "Requested by the customer" : "Opened by your team"} · {dateOnly(ret.createdAt)}
                        </span>
                      </span>
                    </div>
                    <div className="mt-2">
                      {(ret.items || []).map((row) =>
                        byId[row.orderItemId] ? (
                          <ItemRow key={row.orderItemId} item={byId[row.orderItemId]} quantity={row.quantity} currency={order.currency} />
                        ) : null
                      )}
                    </div>
                    {(ret.reason || ret.customerNote) && (
                      <p className="text-sm text-ink m-0 mt-1">
                        <span className="text-ink-muted">Reason:</span> {ret.reason || "—"}
                        {ret.customerNote ? <span className="block text-ink-muted mt-1 whitespace-pre-wrap">“{ret.customerNote}”</span> : null}
                      </p>
                    )}
                    {ret.merchantNote && <p className="text-xs text-ink-muted m-0 mt-1">Your note: {ret.merchantNote}</p>}
                    <div className="flex flex-wrap items-center justify-end gap-2 mt-3">
                      {ret.status === "requested" && (
                        <>
                          <Button danger type="text" loading={busy === `${ret.id}-decline`} onClick={() => returnAction(ret, "decline")}>
                            Decline
                          </Button>
                          <Button type="primary" loading={busy === `${ret.id}-approve`} onClick={() => returnAction(ret, "approve")}>
                            Approve return
                          </Button>
                        </>
                      )}
                      {ret.status === "approved" && (
                        <>
                          <Checkbox checked={restockReturn} onChange={(e) => setRestockReturn(e.target.checked)}>
                            Restock items
                          </Checkbox>
                          <Button
                            type="primary"
                            loading={busy === `${ret.id}-receive`}
                            onClick={() => returnAction(ret, "receive", { restock: restockReturn })}
                          >
                            Mark as received
                          </Button>
                        </>
                      )}
                      {ret.status === "received" && paid && canRefund && (
                        <Button
                          type="primary"
                          icon={<Undo2 size={15} aria-hidden="true" />}
                          onClick={() => {
                            setRefundPreset({ returnId: ret.id, items: ret.items, reason: ret.reason ? `Return: ${ret.reason}` : "Return" });
                            setDialog("refund");
                          }}
                        >
                          Refund return
                        </Button>
                      )}
                      {ret.status === "received" && order.paymentStatus === "pending" && (
                        <span className="text-xs text-ink-muted">Mark the order as paid before refunding.</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          <Card
            size="small"
            title={<CardTitle icon={IndianRupee} badge={<StatusBadge status={order.paymentStatus} />}>Payment</CardTitle>}
            extra={<span className="text-xs text-ink-muted">{PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod}</span>}
          >
            <SummaryRow label={`Subtotal · ${order.items.reduce((n, i) => n + i.quantity, 0)} items`} value={formatCurrency(order.subtotal, order.currency)} />
            {Number(order.discount) > 0 && (
              <SummaryRow
                label={`Discount${order.discountCode ? ` (${order.discountCode})` : ""}`}
                value={`−${formatCurrency(order.discount, order.currency)}`}
              />
            )}
            <SummaryRow label="Shipping" value={Number(order.shipping) > 0 ? formatCurrency(order.shipping, order.currency) : "Free"} />
            {Number(order.tax) > 0 && <SummaryRow label="Tax" value={formatCurrency(order.tax, order.currency)} />}
            <div className="border-t border-app-border mt-1 pt-1">
              <SummaryRow label="Total" value={formatCurrency(order.total, order.currency)} strong />
            </div>
            {Number(order.giftCardAmount) > 0 && (
              <>
                <SummaryRow
                  label={
                    <>
                      Gift card{" "}
                      {order.giftCard?.id ? (
                        <Link href={`/admin/gift-cards/${order.giftCard.id}`} className="text-ink hover:underline tabular-nums">
                          ••••{order.giftCard.last4}
                        </Link>
                      ) : null}
                    </>
                  }
                  value={`−${formatCurrency(order.giftCardAmount, order.currency)}`}
                />
                {Number(order.total) - Number(order.giftCardAmount) > 0 && (
                  <SummaryRow
                    label={order.paymentMethod === "cod" ? "Cash on delivery" : "Online payment"}
                    value={formatCurrency(Number(order.total) - Number(order.giftCardAmount), order.currency)}
                  />
                )}
              </>
            )}
            {order.refunds.map((r) => (
              <SummaryRow
                key={r.id}
                label={`Refunded ${dateOnly(r.createdAt)}${r.reason ? ` · ${r.reason}` : ""}${r.method === "manual" ? " · manual" : r.method === "gift_card" ? " · to gift card" : ""}`}
                value={`−${formatCurrency(r.amount, order.currency)}`}
              />
            ))}
            {refundedTotal > 0 && (
              <div className="border-t border-app-border mt-1 pt-1">
                <SummaryRow label="Net payment" value={formatCurrency(Number(order.total) - refundedTotal, order.currency)} strong />
              </div>
            )}
            {codPending && (
              <div className="flex items-center justify-between gap-3 mt-3 rounded-lg bg-app-bg px-3 py-2.5">
                <span className="text-sm text-ink-muted">
                  {order.paymentMethod === "cod"
                    ? `Collect ${formatCurrency(Number(order.total) - Number(order.giftCardAmount || 0), order.currency)} cash on delivery, then mark it paid.`
                    : "Waiting for the online payment."}
                </span>
                {order.paymentMethod === "cod" && (
                  <Button size="small" loading={busy === "paid"} onClick={markPaid}>
                    Mark as paid
                  </Button>
                )}
              </div>
            )}
          </Card>

          <Card size="small" title="Timeline">
            <Timeline order={order} onChange={() => router.refresh()} />
          </Card>
        </div>

        <div className="flex flex-col gap-6 min-w-0">
          <Card size="small" title="Customer">
            {order.customer ? (
              <Link href={`/admin/customers/${order.customer.id}`} className="text-sm font-medium text-ink hover:underline">
                {order.customer.name}
              </Link>
            ) : (
              <p className="text-sm text-ink-muted m-0">Guest</p>
            )}
            <div className="mt-3 text-sm flex flex-col gap-1">
              {order.email && (
                <a href={`mailto:${order.email}`} className="text-ink-muted hover:text-ink break-all">
                  {order.email}
                </a>
              )}
              {order.phone && (
                <a href={`tel:${order.phone}`} className="text-ink-muted hover:text-ink">
                  {order.phone}
                </a>
              )}
            </div>
          </Card>

          {order.shippingAddress1 && (
            <Card size="small" title="Shipping address">
              <address className="not-italic text-sm text-ink leading-relaxed">
                {order.shippingName}
                <br />
                {order.shippingAddress1}
                {order.shippingAddress2 ? `, ${order.shippingAddress2}` : ""}
                <br />
                {order.shippingCity}, {order.shippingProvince} {order.shippingZip}
                <br />
                {order.shippingCountry}
              </address>
              <Button
                size="small"
                type="link"
                className="!px-0 mt-2"
                icon={<Copy size={13} aria-hidden="true" />}
                onClick={async () => {
                  const text = [
                    order.shippingName,
                    [order.shippingAddress1, order.shippingAddress2].filter(Boolean).join(", "),
                    `${order.shippingCity}, ${order.shippingProvince} ${order.shippingZip}`,
                    order.phone,
                  ]
                    .filter(Boolean)
                    .join("\n");
                  try {
                    await navigator.clipboard.writeText(text);
                    message.success("Address copied");
                  } catch {
                    message.error("Couldn't copy");
                  }
                }}
              >
                Copy address
              </Button>
            </Card>
          )}

          <Card size="small" title={<CardTitle icon={FileText}>GST invoice</CardTitle>}>
            {order.invoiceNumber ? (
              <>
                <p className="text-sm m-0 font-medium text-ink">{order.invoiceNumber}</p>
                <p className="text-xs text-ink-muted m-0 mt-0.5">Issued {dateOnly(order.invoicedAt)}</p>
                <Button className="mt-3" icon={<ExternalLink size={14} aria-hidden="true" />} onClick={() => openStatusPage("/invoice")}>
                  View invoice
                </Button>
              </>
            ) : hasGstInvoices ? (
              <>
                <p className="text-sm text-ink-muted m-0">Issued automatically when the order ships, or now if you need it sooner.</p>
                <Button
                  className="mt-3"
                  loading={busy === "invoice"}
                  disabled={cancelled || (order.paymentStatus === "pending" && liveShipments.length === 0)}
                  onClick={issueInvoice}
                >
                  Issue invoice
                </Button>
              </>
            ) : (
              <p className="text-sm text-ink-muted m-0">
                <Crown size={13} className="inline text-accent mr-1 -mt-0.5" aria-hidden="true" />
                GST invoices come with Premium.{" "}
                <Link href="/admin/settings/billing" className="text-ink underline">
                  See plans
                </Link>
              </p>
            )}
          </Card>

          {order.returnDeadline && !cancelled && (
            <p className="text-xs text-ink-muted m-0 px-1">
              The customer can request a return from their order page until {dateOnly(order.returnDeadline)}.
            </p>
          )}
        </div>
      </div>

      <FulfillModal order={order} open={dialog === "fulfill"} onClose={() => setDialog(null)} onDone={done} />
      <RefundModal
        order={order}
        open={dialog === "refund"}
        preset={refundPreset}
        onClose={() => {
          setDialog(null);
          setRefundPreset(null);
        }}
        onDone={done}
      />
      <ReturnModal order={order} open={dialog === "return"} onClose={() => setDialog(null)} onDone={done} />
      <CancelModal order={order} open={dialog === "cancel"} canRefund={canRefund} onClose={() => setDialog(null)} onDone={done} />
    </div>
  );
}
