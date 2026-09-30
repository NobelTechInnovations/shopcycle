"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Form, Input, Modal, Segmented, Select, Skeleton, Switch, Table, Tag } from "antd";
import { LifeBuoy, Plus, Pencil, Trash2, Sparkles, MessageSquare, Inbox, CheckCircle2, Search } from "lucide-react";
import { PageHeader, StatusBadge, EmptyState, Markdown, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { TICKET_STATUS as STATUS, PRIORITY_COLOR, ago } from "@/lib/support";

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card px-4 py-3.5">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-muted">
        <Icon size={14} aria-hidden="true" /> {label}
      </div>
      <div className="text-[22px] font-semibold text-ink mt-1 tabular-nums">{value}</div>
      {hint && <div className="text-[12px] text-ink-subtle">{hint}</div>}
    </div>
  );
}

// ── Tickets ─────────────────────────────────────────────────────────
function Tickets() {
  const router = useRouter();
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams({ status, page: String(page) });
    if (q) params.set("q", q);
    apiFetch(`/api/super-admin/support/tickets?${params}`).then(setData);
  }, [status, q, page]);

  const counts = data?.counts || {};
  return (
    <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card">
      <div className="flex flex-col md:flex-row md:items-center gap-3 p-3 border-b border-app-border">
        <Segmented
          value={status}
          onChange={(v) => (setStatus(v), setPage(1))}
          options={[
            { value: "open", label: `Needs reply${counts.open ? ` · ${counts.open}` : ""}` },
            { value: "waiting", label: "Waiting on seller" },
            { value: "resolved", label: "Solved" },
            { value: "closed", label: "Closed" },
            { value: "all", label: "All" },
          ]}
        />
        <Input.Search allowClear placeholder="Subject, email, store or #1042" onSearch={(v) => (setQ(v.trim()), setPage(1))} className="md:max-w-xs md:ml-auto" />
      </div>
      <Table
        rowKey="id"
        loading={!data}
        dataSource={data?.tickets || []}
        scroll={{ x: "max-content" }}
        onRow={(r) => ({ onClick: () => router.push(`/support/${r.id}`), className: "cursor-pointer" })}
        pagination={data && data.total > data.pageSize && { current: page, pageSize: data.pageSize, total: data.total, onChange: setPage, showSizeChanger: false }}
        columns={[
          {
            title: "Ticket",
            render: (_, t) => (
              <div className="min-w-0 max-w-[420px]">
                <div className="text-ink font-medium truncate">{t.subject}</div>
                <div className="text-xs text-ink-muted truncate">
                  {t.ref} · {t.store?.name} · {t.email}
                </div>
              </div>
            ),
          },
          { title: "Priority", width: 100, render: (_, t) => <Tag color={PRIORITY_COLOR[t.priority]} className="!m-0 capitalize">{t.priority}</Tag> },
          { title: "Status", width: 170, render: (_, t) => <StatusBadge status={t.status} {...STATUS[t.status]} /> },
          { title: "Messages", width: 100, responsive: ["md"], render: (_, t) => <span className="tabular-nums text-ink-muted">{t.messageCount}</span> },
          { title: "Last activity", width: 130, render: (_, t) => <span className="text-[13px] text-ink-muted">{ago(t.lastMessageAt)}</span> },
        ]}
        locale={{ emptyText: <EmptyState icon={<Inbox />} title={status === "open" ? "Nothing waiting on you" : "No tickets here"} description="Tickets sellers open from Help appear here." /> }}
      />
    </div>
  );
}

// ── Articles ────────────────────────────────────────────────────────
function ArticleModal({ article, categories, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const body = Form.useWatch("body", form);
  useEffect(() => {
    form.setFieldsValue(article?.id ? { ...article, keywords: article.keywords || [] } : { category: categories[0]?.key, published: true, keywords: [], body: "" });
  }, [article, categories, form]);
  async function save(values) {
    setSaving(true);
    try {
      const path = article?.id ? `/api/super-admin/support/articles/${article.id}` : "/api/super-admin/support/articles";
      await apiFetch(path, { method: article?.id ? "PATCH" : "POST", body: values });
      message.success("Article saved — the assistant uses it straight away");
      onSaved();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open={Boolean(article)} title={article?.id ? "Edit article" : "New article"} onCancel={onClose} onOk={() => form.submit()} okText="Save" confirmLoading={saving} width={760} destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={save} className="mt-3">
        <Form.Item name="title" label="Title" rules={[{ required: true, min: 3 }]}>
          <Input maxLength={160} placeholder="How to connect your domain" />
        </Form.Item>
        <div className="grid gap-x-4 sm:grid-cols-[1fr_1fr_auto]">
          <Form.Item name="category" label="Topic">
            <Select options={categories.map((c) => ({ value: c.key, label: c.label }))} />
          </Form.Item>
          <Form.Item name="keywords" label="Search words" extra="Words sellers might use — incl. Hindi/Hinglish.">
            <Select mode="tags" tokenSeparators={[","]} placeholder="dns, cname, godaddy" />
          </Form.Item>
          <Form.Item name="published" label="Published" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
        <Form.Item
          name="body"
          label={
            <span className="flex items-center gap-3">
              Article
              <Segmented size="small" value={preview ? "preview" : "write"} onChange={(v) => setPreview(v === "preview")} options={[{ value: "write", label: "Write" }, { value: "preview", label: "Preview" }]} />
            </span>
          }
          rules={[{ required: true, min: 10 }]}
          extra="Paragraphs, '- ' bullets, '1.' steps, **bold** and [links](/admin/settings). Name exact places: Settings ▸ Payments."
        >
          {preview ? <div className="border border-app-border rounded-lg p-4 max-h-[420px] overflow-y-auto"><Markdown text={body} /></div> : <Input.TextArea autoSize={{ minRows: 10, maxRows: 22 }} maxLength={20000} />}
        </Form.Item>
      </Form>
    </Modal>
  );
}

function Articles() {
  const { confirmDialog } = useConfirmDialog();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [probe, setProbe] = useState("");
  const [probeHits, setProbeHits] = useState(null);
  const load = useCallback(() => apiFetch("/api/super-admin/support/articles").then(setData), []);
  useEffect(() => {
    load();
  }, [load]);
  const catLabel = (k) => data?.categories.find((c) => c.key === k)?.label || k;

  async function testQuestion(v) {
    setProbe(v);
    if (!v.trim()) return setProbeHits(null);
    const r = await apiFetch(`/api/super-admin/support/articles-search?q=${encodeURIComponent(v)}`);
    setProbeHits(r.articles);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-4">
        <p className="text-[13px] font-medium text-ink m-0 mb-2">Which articles would the assistant read for a question?</p>
        <Input.Search placeholder="Type a seller's question" onSearch={testQuestion} enterButton={<Search size={14} aria-hidden="true" />} className="max-w-xl" />
        {probeHits && (
          <p className="text-[13px] text-ink-muted mt-2 mb-0">
            {probeHits.length ? probeHits.map((a) => a.title).join(" · ") : `Nothing matches “${probe}” — add keywords or a new article.`}
          </p>
        )}
      </div>
      <div className="bg-app-surface border border-app-border rounded-[14px] shadow-card">
        <div className="flex items-center justify-between p-3 border-b border-app-border">
          <span className="text-[13px] text-ink-muted">{data ? `${data.articles.length} articles · the assistant answers from the published ones` : " "}</span>
          <Button type="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={() => setEditing({})}>
            New article
          </Button>
        </div>
        <Table
          rowKey="id"
          loading={!data}
          dataSource={data?.articles || []}
          pagination={false}
          scroll={{ x: "max-content" }}
          columns={[
            {
              title: "Article",
              render: (_, a) => (
                <div className="max-w-[440px]">
                  <div className="text-ink font-medium">{a.title}</div>
                  <div className="text-xs text-ink-muted truncate">{(a.keywords || []).join(", ")}</div>
                </div>
              ),
            },
            { title: "Topic", width: 170, render: (_, a) => <span className="text-[13px] text-ink-muted">{catLabel(a.category)}</span> },
            { title: "Status", width: 110, render: (_, a) => (a.published ? <StatusBadge status="published" /> : <StatusBadge status="draft" label="Draft" tone="neutral" />) },
            { title: "Views", width: 80, render: (_, a) => <span className="tabular-nums text-ink-muted">{a.views}</span> },
            {
              title: "Helpful",
              width: 100,
              render: (_, a) => {
                const n = a.helpful + a.notHelpful;
                return <span className="tabular-nums text-ink-muted">{n ? `${Math.round((a.helpful / n) * 100)}% of ${n}` : "—"}</span>;
              },
            },
            {
              title: "",
              width: 90,
              align: "right",
              render: (_, a) => (
                <span className="flex justify-end gap-1">
                  <Button size="small" type="text" icon={<Pencil size={14} aria-hidden="true" />} aria-label={`Edit ${a.title}`} onClick={() => setEditing(a)} />
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<Trash2 size={14} aria-hidden="true" />}
                    aria-label={`Delete ${a.title}`}
                    onClick={() =>
                      confirmDialog({
                        title: `Delete “${a.title}”?`,
                        description: "Sellers and the assistant won't see it any more. Unpublishing keeps it as a draft instead.",
                        okText: "Delete",
                        danger: true,
                        onConfirm: async () => {
                          await apiFetch(`/api/super-admin/support/articles/${a.id}`, { method: "DELETE" });
                          load();
                        },
                      })
                    }
                  />
                </span>
              ),
            },
          ]}
        />
      </div>
      {data && <ArticleModal article={editing} categories={data.categories} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), load())} />}
    </div>
  );
}

// ── Assistant settings ──────────────────────────────────────────────
function Assistant() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [meta, setMeta] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/api/super-admin/support/settings").then((d) => {
      setMeta(d);
      form.setFieldsValue({ ...d.settings, categories: d.settings.categories.map((c) => c.label) });
    });
    apiFetch("/api/super-admin/support/questions").then((d) => setQuestions(d.questions));
  }, [form]);

  async function save(values) {
    setSaving(true);
    try {
      const body = { ...values, categories: (values.categories || []).map((label) => ({ label })) };
      const d = await apiFetch("/api/super-admin/support/settings", { method: "PUT", body });
      form.setFieldsValue({ ...d.settings, categories: d.settings.categories.map((c) => c.label) });
      message.success("Saved — sellers see it straight away");
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!meta) return <Skeleton active paragraph={{ rows: 8 }} />;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
      <Form form={form} layout="vertical" requiredMark={false} onFinish={save} className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink m-0">Help assistant</h2>
            <p className="text-[13px] text-ink-muted m-0">
              {meta.configured
                ? meta.provider === "nvidia"
                  ? "Connected to NVIDIA (Nemotron) with the server's NVIDIA key."
                  : "Connected to Claude with the server's ANTHROPIC_API_KEY."
                : "No AI key on the server (NVIDIA_API_KEY or ANTHROPIC_API_KEY) — sellers get help-centre articles instead."}
            </p>
          </div>
          <Form.Item name="aiEnabled" valuePropName="checked" className="!mb-0">
            <Switch checkedChildren="On" unCheckedChildren="Off" disabled={!meta.configured} />
          </Form.Item>
        </div>
        <Form.Item
          name="model"
          label="Model"
          extra={`Empty uses ${meta.defaultModel}. ${meta.provider === "nvidia" ? "NVIDIA model ids look like nvidia/nemotron-3-ultra-550b-a55b." : "Claude model ids look like claude-sonnet-5."}`}
        >
          <Input placeholder={meta.defaultModel} />
        </Form.Item>
        <Form.Item name="instructions" label="Extra guidance for the assistant" extra="Known issues, current offers, how to phrase things — added to every answer's instructions.">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} maxLength={4000} placeholder="e.g. PayU live keys take 2 working days to activate after KYC — tell sellers to wait before opening a ticket." />
        </Form.Item>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Form.Item name="inbox" label="New tickets go to" extra="Empty: SUPPORT_INBOX, else the billing support email." rules={[{ type: "email", message: "Enter an email" }]}>
            <Input placeholder="support@oyklane.com" />
          </Form.Item>
          <Form.Item name="replyPromise" label="We promise to reply" extra="Shown to sellers: “We'll reply …”.">
            <Input placeholder="within one working day" />
          </Form.Item>
        </div>
        <Form.Item name="suggestions" label="Suggested questions in Help" extra="Up to 8. Press Enter after each.">
          <Select mode="tags" tokenSeparators={["\n"]} open={false} />
        </Form.Item>
        <Form.Item name="categories" label="Ticket topics" extra="The first is the default.">
          <Select mode="tags" tokenSeparators={[","]} open={false} />
        </Form.Item>
        <div className="flex justify-end">
          <Button type="primary" htmlType="submit" loading={saving}>
            Save
          </Button>
        </div>
      </Form>

      <section className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-5">
        <h2 className="text-[15px] font-semibold text-ink m-0">What sellers are asking</h2>
        <p className="text-[13px] text-ink-muted mt-0.5 mb-3">The latest questions — a gap here is an article to write.</p>
        {!questions ? (
          <Skeleton active paragraph={{ rows: 6 }} title={false} />
        ) : questions.length ? (
          <ul className="list-none m-0 p-0 divide-y divide-app-border">
            {questions.map((q) => (
              <li key={q.id} className="py-2.5">
                <p className="m-0 text-[13.5px] text-ink line-clamp-2">{q.question}</p>
                <p className="m-0 mt-0.5 text-[12px] text-ink-muted">
                  {q.store} · {ago(q.createdAt)}
                  {q.turns > 1 ? ` · ${q.turns} questions` : ""} ·{" "}
                  {q.ticketId ? (
                    <Link href={`/support/${q.ticketId}`} className="text-status-warning">became a ticket</Link>
                  ) : q.resolved ? (
                    <span className="text-status-success">solved</span>
                  ) : (
                    "no feedback"
                  )}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-muted m-0">No questions yet.</p>
        )}
      </section>
    </div>
  );
}

export default function SupportPage({ searchParams }) {
  const params = use(searchParams);
  const router = useRouter();
  const tab = ["tickets", "articles", "assistant"].includes(params?.tab) ? params.tab : "tickets";
  const [overview, setOverview] = useState(null);
  useEffect(() => {
    apiFetch("/api/super-admin/support/overview").then(setOverview).catch(() => {});
  }, []);
  const s = overview?.stats;
  const solvedRate = s && s.questions ? Math.round((s.solved / s.questions) * 100) : null;

  return (
    <div>
      <PageHeader title="Support" subtitle="Seller tickets, the help centre, and the assistant that answers first." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat icon={Inbox} label="Needs reply" value={s ? s.openTickets : "—"} hint={s ? `${s.tickets30} tickets in 30 days` : ""} />
        <Stat icon={MessageSquare} label="Questions · 30 days" value={s ? s.questions : "—"} hint="Asked in Help" />
        <Stat icon={CheckCircle2} label="Solved by the assistant" value={solvedRate === null ? "—" : `${solvedRate}%`} hint={s ? `${s.solved} said “yes, thanks”` : ""} />
        <Stat icon={Sparkles} label="Assistant" value={overview ? (overview.assistant.configured && overview.assistant.enabled ? "On" : "Articles only") : "—"} hint={overview?.assistant.model} />
      </div>
      <Segmented
        className="mb-4"
        value={tab}
        onChange={(v) => router.replace(`/support?tab=${v}`)}
        options={[
          { value: "tickets", label: "Tickets", icon: <LifeBuoy size={14} aria-hidden="true" /> },
          { value: "articles", label: "Help articles" },
          { value: "assistant", label: "Assistant" },
        ]}
      />
      {tab === "tickets" && <Tickets />}
      {tab === "articles" && <Articles />}
      {tab === "assistant" && <Assistant />}
    </div>
  );
}
