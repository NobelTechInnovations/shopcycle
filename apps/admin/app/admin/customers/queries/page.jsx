"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Table, Button, Drawer, Input, Tag, Dropdown, Skeleton, App } from "antd";
import { MessageSquare, Search, ExternalLink, Mail, Phone, MoreHorizontal, Archive, Inbox, Trash2, Send, CornerUpLeft } from "lucide-react";
import { PageHeader, EmptyState, ListCard, SearchInput, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { storefrontUrlFor } from "@/lib/storefront";

const STATUS = {
  new: { label: "New", color: "blue" },
  read: { label: "Read", color: "default" },
  replied: { label: "Replied", color: "green" },
  archived: { label: "Archived", color: "default" },
};

const when = (d) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** The sidebar's unread count listens for this. */
const changed = () => window.dispatchEvent(new Event("oy:queries-changed"));

/**
 * Customers ▸ Queries: messages from the store's Contact page. The seller
 * answers by email — the customer gets it in their inbox and can write
 * back to the store's email; nothing comes back here.
 */
export default function QueriesPage() {
  return (
    <Suspense fallback={<Skeleton active />}>
      <Queries />
    </Suspense>
  );
}

function Queries() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState("inbox");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [store, setStore] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: tab, page: String(page) });
      if (q) params.set("q", q);
      setData(await apiFetch(`/api/contact-messages?${params}`));
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab, q, page, message]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    apiFetch("/api/store")
      .then((r) => setStore(r.store))
      .catch(() => {});
  }, []);

  // From the "New customer query" email: open that message.
  const wanted = searchParams.get("open");
  useEffect(() => {
    if (!wanted || !data) return;
    const found = data.messages.find((m) => m.id === wanted);
    if (found) show(found);
    // Only when the list first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, Boolean(data)]);

  function replace(updated) {
    setData((d) => d && { ...d, messages: d.messages.map((m) => (m.id === updated.id ? updated : m)) });
    setOpen((o) => (o?.id === updated.id ? updated : o));
  }

  async function setStatus(m, status, note) {
    try {
      const { message: updated } = await apiFetch(`/api/contact-messages/${m.id}`, { method: "PATCH", body: { status } });
      replace(updated);
      changed();
      if (note) message.success(note);
      return updated;
    } catch (err) {
      message.error(err.message);
      return null;
    }
  }

  async function show(m) {
    setOpen(m);
    if (m.status === "new") await setStatus(m, "read");
  }

  async function remove(m) {
    const ok = await confirmDialog({ title: "Delete this message?", content: "It's removed for good. Emails already sent stay in the customer's inbox.", okText: "Delete", danger: true });
    if (!ok) return;
    try {
      await apiFetch(`/api/contact-messages/${m.id}`, { method: "DELETE" });
      setOpen(null);
      changed();
      message.success("Message deleted");
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  const counts = data?.counts || {};
  const tabs = [
    { key: "inbox", label: "Inbox", count: counts.inbox },
    { key: "new", label: "Unread", count: counts.new },
    { key: "replied", label: "Replied", count: counts.replied },
    { key: "archived", label: "Archived", count: counts.archived },
  ];

  const columns = [
    {
      title: "From",
      key: "from",
      render: (_, m) => (
        <div className="min-w-[160px]">
          <div className={`text-[13.5px] ${m.status === "new" ? "font-semibold text-ink" : "font-medium text-ink"}`}>{m.name}</div>
          <div className="text-[12px] text-ink-muted">{m.email}</div>
        </div>
      ),
    },
    {
      title: "Message",
      key: "message",
      render: (_, m) => <div className="text-[13px] text-ink-muted line-clamp-2 max-w-[520px] min-w-[220px]">{m.message}</div>,
    },
    { title: "Received", key: "at", render: (_, m) => <span className="text-[12.5px] text-ink-muted whitespace-nowrap">{when(m.createdAt)}</span> },
    { title: "Status", key: "status", render: (_, m) => <Tag color={STATUS[m.status]?.color}>{STATUS[m.status]?.label || m.status}</Tag> },
  ];

  const contactUrl = store ? `${storefrontUrlFor(store)}/contact` : null;

  return (
    <div>
      <PageHeader
        title="Queries"
        subtitle="Messages from your store's Contact page. Your reply goes to the customer's email."
        actions={
          contactUrl && (
            <Button icon={<ExternalLink size={15} aria-hidden="true" />} href={contactUrl} target="_blank" rel="noopener">
              View contact page
            </Button>
          )
        }
      />

      <ListCard
        tabs={tabs}
        activeTab={tab}
        onTabChange={(key) => {
          setTab(key);
          setPage(1);
        }}
        toolbar={
          <SearchInput
            placeholder="Search name, email or message"
            onSearch={(v) => {
              setPage(1);
              setQ(v);
            }}
          />
        }
      >
        <Table
          rowKey="id"
          scroll={{ x: "max-content" }}
          loading={loading}
          columns={columns}
          dataSource={data?.messages || []}
          rowClassName="oy-row-link"
          onRow={(m) => ({ onClick: () => show(m) })}
          pagination={data && data.total > data.pageSize && { current: page, pageSize: data.pageSize, total: data.total, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: q ? (
              <EmptyState icon={<Search />} title="No messages match" description="Try a different name, email or word." />
            ) : (
              <EmptyState
                icon={<MessageSquare />}
                title={tab === "archived" ? "Nothing archived" : "No messages yet"}
                description="When a customer writes to you from your store's Contact page, it shows up here and in your email."
              />
            ),
          }}
        />
      </ListCard>

      <MessageDrawer message={open} onClose={() => setOpen(null)} onChange={replace} onStatus={setStatus} onDelete={remove} />
    </div>
  );
}

function MessageDrawer({ message: m, onClose, onChange, onStatus, onDelete }) {
  const { message } = App.useApp();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => setReply(""), [m?.id]);

  async function send() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const { message: updated } = await apiFetch(`/api/contact-messages/${m.id}/reply`, { method: "POST", body: { body: reply } });
      onChange(updated);
      setReply("");
      changed();
      message.success(`Reply sent to ${m.email}`);
    } catch (err) {
      message.error(err.message);
    } finally {
      setSending(false);
    }
  }

  const phone = m?.phone?.replace(/[^\d+]/g, "");
  const menu = m && {
    items: [
      m.status === "archived"
        ? { key: "unarchive", icon: <Inbox size={14} aria-hidden="true" />, label: "Move to inbox", onClick: () => onStatus(m, "read", "Moved to the inbox") }
        : { key: "archive", icon: <Archive size={14} aria-hidden="true" />, label: "Archive", onClick: () => onStatus(m, "archived", "Archived") },
      { key: "unread", icon: <Mail size={14} aria-hidden="true" />, label: "Mark as unread", onClick: () => onStatus(m, "new").then(onClose) },
      { type: "divider" },
      { key: "delete", danger: true, icon: <Trash2 size={14} aria-hidden="true" />, label: "Delete", onClick: () => onDelete(m) },
    ],
  };

  return (
    <Drawer
      open={Boolean(m)}
      onClose={onClose}
      width={560}
      title={m ? m.name : ""}
      extra={
        m && (
          <Dropdown trigger={["click"]} menu={menu}>
            <Button icon={<MoreHorizontal size={15} aria-hidden="true" />} aria-label="More actions" />
          </Dropdown>
        )
      }
      destroyOnHidden
    >
      {m && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
            <a className="inline-flex items-center gap-1.5 text-ink hover:underline" href={`mailto:${m.email}`}>
              <Mail size={14} aria-hidden="true" /> {m.email}
            </a>
            {m.phone && (
              <a className="inline-flex items-center gap-1.5 text-ink hover:underline" href={`tel:${phone}`}>
                <Phone size={14} aria-hidden="true" /> {m.phone}
              </a>
            )}
            <span className="text-ink-muted">{when(m.createdAt)}</span>
          </div>

          <div className="rounded-xl border border-app-border bg-app-bg px-4 py-3 text-[14px] leading-relaxed text-ink whitespace-pre-wrap break-words">{m.message}</div>

          {m.replies.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-[12px] font-medium uppercase tracking-wide text-ink-muted">Your replies</p>
              {m.replies.map((r, i) => (
                <div key={i} className="rounded-xl border border-app-border px-4 py-3">
                  <div className="flex items-center gap-1.5 text-[12px] text-ink-muted mb-1.5">
                    <CornerUpLeft size={13} aria-hidden="true" /> Emailed {when(r.at)}
                    {r.by ? ` · ${r.by}` : ""}
                  </div>
                  <div className="text-[13.5px] leading-relaxed text-ink whitespace-pre-wrap break-words">{r.body}</div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="query-reply" className="text-[13px] font-medium text-ink">
              Reply by email
            </label>
            <Input.TextArea
              id="query-reply"
              rows={6}
              maxLength={5000}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={`Hi ${m.name.split(" ")[0]}, …`}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] text-ink-muted">Sent from your store to {m.email}. If they answer, it reaches your email.</span>
              <Button type="primary" icon={<Send size={14} aria-hidden="true" />} loading={sending} disabled={!reply.trim()} onClick={send}>
                Send reply
              </Button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
