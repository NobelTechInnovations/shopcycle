"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Collapse, Input, Select, Skeleton, Tag } from "antd";
import { LifeBuoy, Send, Sparkles } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState, Markdown } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { TICKET_STATUS, PRIORITY_COLOR } from "@/lib/support";

const stamp = (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function Bubble({ m }) {
  if (m.author === "system") {
    return <p className="text-center text-[12px] text-ink-subtle my-1">{m.body} · {stamp(m.createdAt)}</p>;
  }
  const team = m.author === "support";
  return (
    <div className={`flex ${team ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-[14px] border px-4 py-3 ${team ? "bg-accent-soft/50 border-[#E1D9FF]" : "bg-app-surface border-app-border"}`}>
        <div className="flex items-baseline justify-between gap-4 mb-1">
          <span className="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5">
            {team && <LifeBuoy size={13} className="text-accent" aria-hidden="true" />}
            {m.authorName}
          </span>
          <span className="text-[12px] text-ink-subtle">{stamp(m.createdAt)}</span>
        </div>
        <p className="m-0 text-[14px] leading-relaxed text-ink whitespace-pre-wrap break-words">{m.body}</p>
      </div>
    </div>
  );
}

export default function SupportTicketPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { message } = App.useApp();
  const [ticket, setTicket] = useState(null);
  const [missing, setMissing] = useState(false);
  const [reply, setReply] = useState("");
  const [next, setNext] = useState("waiting");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiFetch(`/api/super-admin/support/tickets/${id}`)
      .then((d) => setTicket(d.ticket))
      .catch(() => setMissing(true));
  }, [id]);

  async function send() {
    setSending(true);
    try {
      const d = await apiFetch(`/api/super-admin/support/tickets/${id}/reply`, { method: "POST", body: { body: reply, status: next } });
      setTicket(d.ticket);
      setReply("");
      message.success(`Reply emailed to ${d.ticket.email}`);
    } catch (err) {
      message.error(err.message);
    } finally {
      setSending(false);
    }
  }

  async function patch(body) {
    try {
      const d = await apiFetch(`/api/super-admin/support/tickets/${id}`, { method: "PATCH", body });
      setTicket(d.ticket);
    } catch (err) {
      message.error(err.message);
    }
  }

  if (missing) return <EmptyState title="Ticket not found" actionLabel="All tickets" onAction={() => router.push("/support")} />;
  if (!ticket) return <Skeleton active paragraph={{ rows: 10 }} />;
  const s = TICKET_STATUS[ticket.status] || TICKET_STATUS.open;

  return (
    <div>
      <PageHeader backHref="/support" breadcrumb={`Ticket ${ticket.ref}`} title={ticket.subject} meta={<StatusBadge status={ticket.status} {...s} />} subtitle={`${ticket.name} · ${ticket.email} · ${ticket.store?.name}`} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        <div className="flex flex-col gap-4">
          {ticket.transcript?.length > 0 && (
            <Collapse
              className="!bg-app-surface"
              items={[
                {
                  key: "ai",
                  label: (
                    <span className="inline-flex items-center gap-2 text-[13px]">
                      <Sparkles size={14} className="text-accent" aria-hidden="true" /> Their conversation with the assistant ({ticket.transcript.filter((m) => m.role === "user").length} questions)
                    </span>
                  ),
                  children: (
                    <div className="flex flex-col gap-3">
                      {ticket.transcript.map((m, i) =>
                        m.role === "user" ? (
                          <p key={i} className="m-0 text-[13.5px] text-ink">
                            <b>Seller:</b> {m.content}
                          </p>
                        ) : (
                          <div key={i} className="rounded-lg bg-app-bg px-3 py-2">
                            <Markdown text={m.content} className="text-[13px]" />
                          </div>
                        )
                      )}
                    </div>
                  ),
                },
              ]}
            />
          )}

          {ticket.messages.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}

          <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-3">
            <Input.TextArea value={reply} onChange={(e) => setReply(e.target.value)} autoSize={{ minRows: 5, maxRows: 16 }} variant="borderless" placeholder={`Reply to ${ticket.name.split(" ")[0]} — it's emailed to ${ticket.email} and shown in their Help page.`} maxLength={10000} aria-label="Reply" />
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-app-border">
              <span className="text-[12.5px] text-ink-muted mr-auto">After sending, mark as</span>
              <Select
                value={next}
                onChange={setNext}
                className="w-[190px]"
                options={[
                  { value: "waiting", label: "Waiting on seller" },
                  { value: "resolved", label: "Solved" },
                  { value: "open", label: "Still needs work" },
                  { value: "closed", label: "Closed" },
                ]}
              />
              <Button type="primary" icon={<Send size={14} aria-hidden="true" />} loading={sending} disabled={!reply.trim()} onClick={send}>
                Send reply
              </Button>
            </div>
          </div>
        </div>

        <aside className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-4 flex flex-col gap-3 lg:sticky lg:top-6">
          <label className="block">
            <span className="block text-[12px] text-ink-muted mb-1">Status</span>
            <Select value={ticket.status} onChange={(status) => patch({ status })} className="w-full" options={Object.entries(TICKET_STATUS).map(([value, v]) => ({ value, label: v.label }))} />
          </label>
          <label className="block">
            <span className="block text-[12px] text-ink-muted mb-1">Priority</span>
            <Select value={ticket.priority} onChange={(priority) => patch({ priority })} className="w-full" options={["low", "normal", "high", "urgent"].map((p) => ({ value: p, label: <Tag color={PRIORITY_COLOR[p]} className="!m-0 capitalize">{p}</Tag> }))} />
          </label>
          <dl className="m-0 text-[13px] grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 pt-2 border-t border-app-border">
            <dt className="text-ink-muted">Store</dt>
            <dd className="m-0 text-ink truncate">{ticket.store?.name}</dd>
            <dt className="text-ink-muted">Handle</dt>
            <dd className="m-0 text-ink truncate">{ticket.store?.handle}</dd>
            {ticket.store?.domain && (
              <>
                <dt className="text-ink-muted">Domain</dt>
                <dd className="m-0 text-ink truncate">{ticket.store.domain}</dd>
              </>
            )}
            <dt className="text-ink-muted">Topic</dt>
            <dd className="m-0 text-ink">{ticket.category}</dd>
            <dt className="text-ink-muted">Opened</dt>
            <dd className="m-0 text-ink">{stamp(ticket.createdAt)}</dd>
          </dl>
        </aside>
      </div>
    </div>
  );
}
