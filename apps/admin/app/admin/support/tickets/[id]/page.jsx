"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Input, Skeleton } from "antd";
import { CheckCircle2, LifeBuoy, Send } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { TICKET_STATUS } from "@/lib/support";

const stamp = (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const initials = (name = "") =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

function Message({ m }) {
  if (m.author === "system") {
    return (
      <div className="flex items-center gap-3 text-[12px] text-ink-subtle my-1">
        <span className="flex-1 h-px bg-app-border" aria-hidden="true" />
        {m.body} · {stamp(m.createdAt)}
        <span className="flex-1 h-px bg-app-border" aria-hidden="true" />
      </div>
    );
  }
  const team = m.author === "support";
  return (
    <div className="flex gap-3 items-start">
      {team ? (
        <span className="w-8 h-8 rounded-full bg-brand-gradient text-white flex items-center justify-center shrink-0" aria-hidden="true">
          <LifeBuoy size={15} />
        </span>
      ) : (
        <span className="w-8 h-8 rounded-full bg-ink text-white text-[11px] font-semibold flex items-center justify-center shrink-0" aria-hidden="true">
          {initials(m.authorName)}
        </span>
      )}
      <div className={`min-w-0 flex-1 rounded-[14px] border px-4 py-3 ${team ? "bg-accent-soft/40 border-[#E1D9FF]" : "bg-app-surface border-app-border"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <span className="text-[13px] font-semibold text-ink">{team ? m.authorName : `${m.authorName} (you)`}</span>
          <span className="text-[12px] text-ink-subtle">{stamp(m.createdAt)}</span>
        </div>
        <p className="m-0 text-[14px] leading-relaxed text-ink whitespace-pre-wrap break-words">{m.body}</p>
      </div>
    </div>
  );
}

export default function TicketPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { message } = App.useApp();
  const [ticket, setTicket] = useState(null);
  const [missing, setMissing] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    apiFetch(`/api/support/tickets/${id}`)
      .then((d) => setTicket(d.ticket))
      .catch(() => setMissing(true));
  }, [id]);

  async function send() {
    if (!reply.trim()) return;
    setBusy("reply");
    try {
      const d = await apiFetch(`/api/support/tickets/${id}/messages`, { method: "POST", body: { body: reply } });
      setTicket(d.ticket);
      setReply("");
      message.success("Reply sent to the team");
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function resolve() {
    setBusy("resolve");
    try {
      const d = await apiFetch(`/api/support/tickets/${id}/resolve`, { method: "POST" });
      setTicket(d.ticket);
    } finally {
      setBusy(null);
    }
  }

  if (missing) return <EmptyState title="Ticket not found" description="It may belong to another store." actionLabel="Help centre" onAction={() => router.push("/admin/support")} />;
  if (!ticket) return <Skeleton active paragraph={{ rows: 8 }} />;
  const s = TICKET_STATUS[ticket.status] || TICKET_STATUS.open;
  const done = ["resolved", "closed"].includes(ticket.status);

  return (
    <div className="max-w-3xl">
      <PageHeader
        backHref="/admin/support"
        breadcrumb={`Ticket ${ticket.ref}`}
        title={ticket.subject}
        meta={<StatusBadge status={ticket.status} label={s.label} tone={s.tone} />}
        subtitle={`Opened ${stamp(ticket.createdAt)} · replies go to ${ticket.email}`}
        actions={
          !done && (
            <Button icon={<CheckCircle2 size={14} aria-hidden="true" />} loading={busy === "resolve"} onClick={resolve}>
              Mark as solved
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-4">
        {ticket.messages.map((m) => (
          <Message key={m.id} m={m} />
        ))}
      </div>

      {ticket.status === "closed" ? (
        <p className="text-[13px] text-ink-muted mt-6">This ticket is closed. Need more help? Open Help and start a new one.</p>
      ) : (
        <div className="mt-6 bg-app-surface border border-app-border rounded-[14px] shadow-card p-3">
          <Input.TextArea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            autoSize={{ minRows: 3, maxRows: 10 }}
            maxLength={8000}
            variant="borderless"
            placeholder={done ? "Reply to reopen this ticket…" : "Add details or reply to the team…"}
            aria-label="Your reply"
          />
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-app-border">
            <span className="text-[12px] text-ink-subtle">The team is emailed straight away.</span>
            <Button type="primary" icon={<Send size={14} aria-hidden="true" />} loading={busy === "reply"} disabled={!reply.trim()} onClick={send}>
              Send reply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
