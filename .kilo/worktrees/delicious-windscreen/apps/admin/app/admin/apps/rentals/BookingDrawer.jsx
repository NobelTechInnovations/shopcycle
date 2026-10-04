"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { App, Button, Checkbox, Descriptions, Drawer, Input, InputNumber, Select, Skeleton } from "antd";
import { PackageCheck, Truck, CheckCircle2, XCircle, CalendarClock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { StatusTag, ContactLinks, HANDOVER, RETURNS, DEPOSIT, rupees, dayLabel, todayDay, daysBetween } from "./shared";

/**
 * One booking: who, what, when, how it travels — and the next step
 * (confirm a request, hand it over, take it back, settle the deposit).
 */
export function BookingDrawer({ bookingId, onClose, onChanged, settings }) {
  const { message, modal } = App.useApp();
  const [b, setB] = useState(null);
  const [busy, setBusy] = useState(null);
  const [depositCollected, setDepositCollected] = useState(true);
  const [returnedOn, setReturnedOn] = useState(null);
  const [lateFee, setLateFee] = useState(null);
  const [note, setNote] = useState("");
  const [editingDates, setEditingDates] = useState(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!bookingId) return;
    setB(null);
    apiFetch(`/api/rentals/bookings/${bookingId}`)
      .then(({ booking }) => {
        setB(booking);
        setNote(booking.note || "");
        setReturnedOn(todayDay());
        setLateFee(null);
      })
      .catch((err) => {
        message.error(err.message || "Couldn't load the booking");
        closeRef.current();
      });
  }, [bookingId, message]);

  async function act(action, body = {}, done) {
    setBusy(action);
    try {
      const { booking } = await apiFetch(`/api/rentals/bookings/${b.id}/${action}`, { method: "POST", body });
      setB(booking);
      onChanged?.();
      if (done) message.success(done);
    } catch (err) {
      if (err.status === 409 && ["confirm", "edit"].includes(action)) {
        modal.confirm({
          title: "Those dates overlap another booking",
          content: `${err.message} Book it anyway? Only do this if you have another piece.`,
          okText: "Book anyway",
          onOk: () => act(action, { ...body, force: true }, done),
        });
      } else {
        message.error(err.message || "That didn't work");
      }
    } finally {
      setBusy(null);
    }
  }

  const lateDays = b && returnedOn ? Math.max(0, daysBetween(b.endDate, returnedOn)) : 0;
  const suggestedFee = lateDays * Number(settings?.lateFeePerDay || 0) * (b?.quantity || 1);

  return (
    <Drawer open={Boolean(bookingId)} onClose={onClose} width={520} title={b ? b.title : "Booking"} destroyOnHidden>
      {!b ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusTag booking={b} />
            <span className="text-[13px] text-ink">
              {dayLabel(b.startDate, true)} → {dayLabel(b.endDate, true)} · {b.days} day{b.days === 1 ? "" : "s"}
            </span>
            {b.order && (
              <Link href={`/admin/orders/${b.order.id}`} className="text-[12.5px]">
                Order #{b.order.orderNumber}
              </Link>
            )}
          </div>

          {b.status !== "blocked" && (
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="Customer">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{b.customerName || "—"}</span>
                  <ContactLinks phone={b.phone} />
                  {b.email && <a href={`mailto:${b.email}`} className="text-[12.5px]">{b.email}</a>}
                </div>
              </Descriptions.Item>
              <Descriptions.Item label="Pieces">{b.quantity}</Descriptions.Item>
              <Descriptions.Item label="Handover">{HANDOVER[b.handover] || b.handover}</Descriptions.Item>
              <Descriptions.Item label="Return">{RETURNS[b.returnMethod] || b.returnMethod}</Descriptions.Item>
              {b.address && <Descriptions.Item label="Address">{b.address}</Descriptions.Item>}
              <Descriptions.Item label="Rent">
                {rupees(b.rentalTotal)} <span className="text-ink-muted text-[12px]">({rupees(b.pricePerDay)}/day)</span>
              </Descriptions.Item>
              {b.deposit > 0 && (
                <Descriptions.Item label="Deposit">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{rupees(b.deposit)}</span>
                    <Select
                      size="small"
                      value={b.depositStatus}
                      className="w-[170px]"
                      onChange={(depositStatus) => act("deposit", { depositStatus }, "Deposit updated")}
                      options={["due", "held", "refunded", "kept"].map((v) => ({ value: v, label: DEPOSIT[v] }))}
                    />
                  </div>
                </Descriptions.Item>
              )}
              {b.lateFee > 0 && <Descriptions.Item label="Late fee">{rupees(b.lateFee)}</Descriptions.Item>}
            </Descriptions>
          )}

          {/* The next step for this booking */}
          {b.status === "requested" && (
            <div className="rounded-[10px] border border-app-border p-3 flex flex-col gap-2">
              <p className="m-0 text-[13px] text-ink">Call the customer to agree the booking, then confirm it — the dates are held from then on.</p>
              <div className="flex gap-2">
                <Button type="primary" icon={<CheckCircle2 size={14} aria-hidden="true" />} loading={busy === "confirm"} onClick={() => act("confirm", {}, "Booking confirmed")}>
                  Confirm booking
                </Button>
                <Button danger loading={busy === "cancel"} onClick={() => act("cancel", {}, "Request declined")}>
                  Decline
                </Button>
              </div>
            </div>
          )}
          {b.status === "confirmed" && (
            <div className="rounded-[10px] border border-app-border p-3 flex flex-col gap-2">
              <p className="m-0 text-[13px] text-ink">
                {b.handover === "delivery" ? "When it's delivered" : "When the customer collects it"}, mark it handed over.
              </p>
              {b.depositStatus === "due" && (
                <Checkbox checked={depositCollected} onChange={(e) => setDepositCollected(e.target.checked)}>
                  Deposit of {rupees(b.deposit)} collected
                </Checkbox>
              )}
              <div>
                <Button type="primary" icon={<Truck size={14} aria-hidden="true" />} loading={busy === "out"} onClick={() => act("out", { depositCollected }, "Marked as handed over")}>
                  Handed over
                </Button>
              </div>
            </div>
          )}
          {b.status === "out" && (
            <div className="rounded-[10px] border border-app-border p-3 flex flex-col gap-3">
              <p className="m-0 text-[13px] text-ink">{b.late ? `Due back ${dayLabel(b.endDate)} — ${b.lateDays} day${b.lateDays === 1 ? "" : "s"} late.` : `Due back ${dayLabel(b.endDate, true)}.`}</p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
                  Returned on
                  <Input type="date" value={returnedOn || ""} onChange={(e) => setReturnedOn(e.target.value)} className="w-[160px]" />
                </label>
                <label className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
                  Late fee
                  <InputNumber min={0} prefix="₹" value={lateFee ?? suggestedFee} onChange={setLateFee} className="w-[130px]" />
                </label>
              </div>
              {lateDays > 0 && <p className="m-0 text-[12px] text-ink-muted">{lateDays} day{lateDays === 1 ? "" : "s"} late{settings?.lateFeePerDay ? ` × ${rupees(settings.lateFeePerDay)} a day` : " — set a late fee per day in Settings"}.</p>}
              <div>
                <Button
                  type="primary"
                  icon={<PackageCheck size={14} aria-hidden="true" />}
                  loading={busy === "returned"}
                  onClick={() => act("returned", { returnedOn, lateFee: lateFee ?? suggestedFee }, "Marked as returned")}
                >
                  Returned
                </Button>
              </div>
            </div>
          )}
          {b.status === "returned" && b.deposit > 0 && ["held", "due"].includes(b.depositStatus) && (
            <div className="rounded-[10px] border border-app-border p-3 flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-ink flex-1">Back safely? Give the deposit back.</span>
              <Button type="primary" loading={busy === "deposit"} onClick={() => act("deposit", { depositStatus: "refunded" }, "Deposit marked as given back")}>
                Deposit given back
              </Button>
              <Button onClick={() => act("deposit", { depositStatus: "kept" }, "Deposit marked as kept")}>Keep it</Button>
            </div>
          )}

          {["requested", "confirmed", "blocked"].includes(b.status) && (
            <div className="flex flex-col gap-2">
              {editingDates ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input type="date" value={editingDates[0]} onChange={(e) => setEditingDates([e.target.value, editingDates[1]])} className="w-[150px]" aria-label="First day" />
                  <span className="text-ink-muted">→</span>
                  <Input type="date" value={editingDates[1]} min={editingDates[0]} onChange={(e) => setEditingDates([editingDates[0], e.target.value])} className="w-[150px]" aria-label="Last day" />
                  <Button
                    type="primary"
                    size="small"
                    loading={busy === "edit"}
                    onClick={() => act("edit", { start: editingDates[0], end: editingDates[1] }, "Dates changed").then(() => setEditingDates(null))}
                  >
                    Save dates
                  </Button>
                  <Button size="small" onClick={() => setEditingDates(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button size="small" className="self-start" icon={<CalendarClock size={13} aria-hidden="true" />} onClick={() => setEditingDates([b.startDate, b.endDate])}>
                  Change dates
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-ink-muted">Note (only you see it)</span>
            <Input.TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Size altered, delivery slot, condition on return…" />
            {note !== (b.note || "") && (
              <Button size="small" className="self-start" loading={busy === "edit"} onClick={() => act("edit", { note }, "Note saved")}>
                Save note
              </Button>
            )}
          </div>

          {["requested", "confirmed", "blocked"].includes(b.status) && (
            <Button
              danger
              type="text"
              className="self-start"
              icon={<XCircle size={14} aria-hidden="true" />}
              onClick={() =>
                modal.confirm({
                  title: b.status === "blocked" ? "Unblock these dates?" : "Cancel this booking?",
                  content: b.order ? "This frees the dates. The order itself isn't cancelled — do that from the order if needed." : "This frees the dates.",
                  okText: b.status === "blocked" ? "Unblock" : "Cancel booking",
                  okButtonProps: { danger: true },
                  onOk: () => act("cancel", {}, b.status === "blocked" ? "Dates unblocked" : "Booking cancelled"),
                })
              }
            >
              {b.status === "blocked" ? "Unblock dates" : "Cancel booking"}
            </Button>
          )}
        </div>
      )}
    </Drawer>
  );
}
