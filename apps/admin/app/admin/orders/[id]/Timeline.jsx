"use client";

import { useState } from "react";
import { Button, Input, App } from "antd";
import {
  ShoppingBag,
  IndianRupee,
  Truck,
  PackageCheck,
  Undo2,
  XCircle,
  Mail,
  MessageSquare,
  RotateCcw,
  FileText,
  Circle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { dateTime } from "./order-utils";

const ICONS = {
  placed: ShoppingBag,
  paid: IndianRupee,
  fulfilled: Truck,
  delivered: PackageCheck,
  refunded: Undo2,
  cancelled: XCircle,
  email: Mail,
  note: MessageSquare,
  return: RotateCcw,
  invoice: FileText,
};

/** The order's history, newest first, with a box for staff notes. Notes
 * are private to the store — they never reach the customer. */
export function Timeline({ order, onChange }) {
  const { message } = App.useApp();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function post() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/api/orders/${order.id}/notes`, { method: "POST", body: { note } });
      setNote("");
      onChange();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2 items-start">
        <Input.TextArea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Leave a note for your team — the customer won't see it"
          autoSize={{ minRows: 1, maxRows: 5 }}
          maxLength={2000}
          aria-label="Order note"
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              post();
            }
          }}
        />
        <Button onClick={post} loading={saving} disabled={!note.trim()}>
          Post
        </Button>
      </div>

      <ol className="list-none p-0 m-0 mt-5 relative">
        {order.events.map((event, index) => {
          const Icon = ICONS[event.kind] || Circle;
          const last = index === order.events.length - 1;
          return (
            <li key={event.id} className="relative flex gap-3 pb-5">
              {!last && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-app-border" aria-hidden="true" />}
              <span
                className={`relative z-[1] w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  event.kind === "note" ? "bg-accent-soft text-accent" : "bg-app-bg text-ink-muted border border-app-border"
                }`}
                aria-hidden="true"
              >
                <Icon size={14} />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={`m-0 text-sm text-ink break-words ${event.kind === "note" ? "whitespace-pre-wrap" : ""}`}>{event.message}</p>
                <p className="m-0 mt-0.5 text-xs text-ink-muted">
                  {dateTime(event.createdAt)}
                  {event.actorName ? ` · ${event.actorName}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
