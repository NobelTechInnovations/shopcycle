"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Segmented, Table, Tag, Modal, Radio, Switch, App, Upload, Alert, Tooltip, Empty } from "antd";
import { Star, Upload as UploadIcon, Settings2, MessageSquareReply, Trash2, Eye, EyeOff, Check, Download, ArrowLeft } from "lucide-react";
import { PageHeader, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

function Stars({ value, size = 13 }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} aria-hidden="true" className={n <= Math.round(value) ? "fill-[#f5a524] text-[#f5a524]" : "text-app-border"} />
      ))}
    </span>
  );
}

const when = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const SAMPLE_HEADER = "product_slug,rating,title,body,author,email,date,verified";

function SettingsModal({ open, settings, onClose, onSaved }) {
  const { message } = App.useApp();
  const [v, setV] = useState(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => setV(settings), [settings]);
  if (!v) return null;
  async function save() {
    setSaving(true);
    try {
      const { settings: next } = await apiFetch("/api/reviews/settings", { method: "PUT", body: v });
      onSaved(next);
      message.success("Review settings saved");
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open={open} onCancel={onClose} title="Review settings" okText="Save" onOk={save} confirmLoading={saving} destroyOnHidden>
      <div className="flex flex-col gap-5 mt-3">
        <div>
          <p className="m-0 mb-2 text-sm font-medium text-ink">Who can write a review</p>
          <Radio.Group value={v.whoCanReview} onChange={(e) => setV({ ...v, whoCanReview: e.target.value })} className="flex flex-col gap-1.5">
            <Radio value="anyone">Anyone</Radio>
            <Radio value="buyers">Only customers who bought the product (checked by their email)</Radio>
          </Radio.Group>
        </div>
        <div>
          <p className="m-0 mb-2 text-sm font-medium text-ink">Publish new reviews</p>
          <Radio.Group value={v.autoPublish} onChange={(e) => setV({ ...v, autoPublish: e.target.value })} className="flex flex-col gap-1.5">
            <Radio value="verified">Straight away from verified buyers; I check the rest</Radio>
            <Radio value="all">Straight away, all of them</Radio>
            <Radio value="none">Only after I approve each one</Radio>
          </Radio.Group>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-app-border px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium text-ink">Stars on product cards</span>
            <span className="block text-xs text-ink-muted">On collection pages, search and home page product rows.</span>
          </span>
          <Switch checked={v.showOnCards} onChange={(c) => setV({ ...v, showOnCards: c })} />
        </label>
      </div>
    </Modal>
  );
}

function ImportModal({ open, onClose, onDone }) {
  const { message } = App.useApp();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [sampleSlugs, setSampleSlugs] = useState([]);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setResult(null);
    apiFetch("/api/products?pageSize=3&status=active")
      .then((d) => setSampleSlugs(d.products.map((p) => p.slug)))
      .catch(() => {});
  }, [open]);

  function downloadSample() {
    const slugs = sampleSlugs.length ? sampleSlugs : ["your-product-slug"];
    const rows = [
      SAMPLE_HEADER,
      `${slugs[0]},5,Love it,"Great fit and the fabric feels premium. Would buy again.",Ananya S.,ananya@example.com,2026-08-14,yes`,
      `${slugs[1] || slugs[0]},4,Good value,"Nice quality for the price, runs slightly large.",Rohan M.,,2026-08-20,no`,
    ];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "reviews-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    try {
      const csv = await file.text();
      const r = await apiFetch("/api/reviews/import", { method: "POST", body: { csv } });
      setResult(r);
      if (r.imported) {
        message.success(`${r.imported} review${r.imported === 1 ? "" : "s"} imported`);
        onDone();
      }
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Import reviews from a CSV"
      width={620}
      destroyOnHidden
      footer={
        result ? (
          <Button type="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" disabled={!file} loading={busy} onClick={run}>
              Import
            </Button>
          </div>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3 mt-2">
          <Alert
            type={result.skippedCount ? "warning" : "success"}
            showIcon
            message={`${result.imported} imported${result.skippedCount ? `, ${result.skippedCount} skipped` : ""}`}
          />
          {result.skipped.length > 0 && (
            <ul className="m-0 pl-4 text-[13px] text-ink-muted max-h-48 overflow-y-auto">
              {result.skipped.map((s) => (
                <li key={s.line}>
                  Row {s.line}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 mt-2">
          <p className="m-0 text-[13px] text-ink-muted">
            One row per review. Products are matched by their <b>slug</b> — the last part of the product's address, e.g. <code>/products/pure-linen-shirt</code> →{" "}
            <code>pure-linen-shirt</code>. Imported reviews are published straight away.
          </p>
          <div className="rounded-lg border border-app-border bg-app-bg p-3 text-xs font-mono text-ink-muted overflow-x-auto whitespace-nowrap">{SAMPLE_HEADER}</div>
          <p className="m-0 text-xs text-ink-muted">
            Required: <b>product_slug</b>, <b>rating</b> (1–5), <b>body</b>. Optional: title, author, email, date, verified (yes/no), reply.
          </p>
          <Upload.Dragger
            accept=".csv,text/csv"
            maxCount={1}
            beforeUpload={(f) => {
              setFile(f);
              return false;
            }}
            onRemove={() => setFile(null)}
            fileList={file ? [{ uid: "1", name: file.name, status: "done" }] : []}
          >
            <div className="flex flex-col items-center gap-2 py-3">
              <UploadIcon size={18} className="text-ink-muted" aria-hidden="true" />
              <span className="text-sm font-medium text-ink">Drop a .csv file here or click to choose</span>
              <span className="text-xs text-ink-muted">Up to 5,000 reviews</span>
            </div>
          </Upload.Dragger>
          <Button size="small" icon={<Download size={13} aria-hidden="true" />} onClick={downloadSample} className="self-start">
            Download a sample CSV
          </Button>
        </div>
      )}
    </Modal>
  );
}

export function ReviewsPanel() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [data, setData] = useState(null);
  const [notInstalled, setNotInstalled] = useState(false);
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [replying, setReplying] = useState(null);
  const [replyText, setReplyText] = useState("");

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), ...(status !== "all" && { status }), ...(q && { q }) });
      const d = await apiFetch(`/api/reviews?${params}`);
      setData(d);
      // Nothing waiting on first open → show what's live instead.
      if (status === "pending" && d.counts.pending === 0 && page === 1 && !q && d.counts.published > 0 && !data) setStatus("published");
    } catch (err) {
      if (err.status === 402) setNotInstalled(true);
      else message.error(err.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, q, message]);

  useEffect(() => {
    load();
  }, [load]);

  async function setReviewStatus(id, next) {
    await apiFetch(`/api/reviews/${id}`, { method: "PATCH", body: { status: next } });
    load();
  }

  async function bulk(action) {
    const { count } = await apiFetch("/api/reviews/bulk", { method: "POST", body: { ids: selected, action } });
    message.success(`${count} review${count === 1 ? "" : "s"} updated`);
    setSelected([]);
    load();
  }

  async function saveReply() {
    await apiFetch(`/api/reviews/${replying.id}`, { method: "PATCH", body: { reply: replyText } });
    setReplying(null);
    message.success(replyText.trim() ? "Reply posted" : "Reply removed");
    load();
  }

  if (notInstalled) {
    return (
      <div>
        <PageHeader title="Product Reviews" backHref="/admin/apps" />
        <Card>
          <Empty
            image={<Star size={40} className="text-ink-subtle mx-auto" aria-hidden="true" />}
            description={<span className="text-ink-muted">Install Product Reviews from Apps to turn on star ratings and the review form.</span>}
          >
            <Link href="/admin/apps">
              <Button type="primary">Go to Apps</Button>
            </Link>
          </Empty>
        </Card>
      </div>
    );
  }

  const counts = data?.counts || { pending: 0, published: 0, hidden: 0 };

  return (
    <div>
      <PageHeader
        title="Product Reviews"
        backHref="/admin/apps"
        subtitle="Stars and reviews show on your product pages and product cards. New reviews land here."
        actions={
          <>
            <Button icon={<UploadIcon size={14} aria-hidden="true" />} onClick={() => setImportOpen(true)}>
              Import CSV
            </Button>
            <Button icon={<Settings2 size={14} aria-hidden="true" />} onClick={() => setSettingsOpen(true)}>
              Settings
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Average rating", value: data ? (data.average ? data.average.toFixed(1) : "—") : "…", extra: data?.average ? <Stars value={data.average} /> : null },
          { label: "Published", value: counts.published },
          { label: "Waiting for you", value: counts.pending, tone: counts.pending ? "text-status-warning" : "" },
          { label: "Hidden", value: counts.hidden },
        ].map((t) => (
          <Card key={t.label} size="small">
            <p className="m-0 text-xs text-ink-muted">{t.label}</p>
            <p className={`m-0 mt-1 text-[22px] font-semibold tabular-nums ${t.tone || "text-ink"}`}>{t.value}</p>
            {t.extra}
          </Card>
        ))}
      </div>

      <Card size="small">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <Segmented
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
              setSelected([]);
            }}
            options={[
              { value: "pending", label: `Waiting (${counts.pending})` },
              { value: "published", label: `Published (${counts.published})` },
              { value: "hidden", label: `Hidden (${counts.hidden})` },
              { value: "all", label: "All" },
            ]}
          />
          <Input.Search allowClear placeholder="Search reviews, names, products" className="max-w-xs" onSearch={(v) => { setQ(v); setPage(1); }} />
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3 rounded-lg bg-app-bg px-3 py-2">
            <span className="text-[13px] text-ink">{selected.length} selected</span>
            <Button size="small" icon={<Check size={13} aria-hidden="true" />} onClick={() => bulk("published")}>
              Publish
            </Button>
            <Button size="small" icon={<EyeOff size={13} aria-hidden="true" />} onClick={() => bulk("hidden")}>
              Hide
            </Button>
            <Button
              size="small"
              danger
              icon={<Trash2 size={13} aria-hidden="true" />}
              onClick={() => confirmDialog({ title: `Delete ${selected.length} reviews?`, description: "This can't be undone.", okText: "Delete", danger: true, onConfirm: () => bulk("delete") })}
            >
              Delete
            </Button>
          </div>
        )}

        <Table
          rowKey="id"
          size="small"
          loading={!data}
          dataSource={data?.reviews || []}
          scroll={{ x: "max-content" }}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          pagination={{ current: page, pageSize: data?.pageSize || 25, total: data?.total || 0, onChange: setPage, showSizeChanger: false }}
          locale={{ emptyText: status === "pending" ? "Nothing waiting — you're all caught up." : "No reviews here yet." }}
          columns={[
            {
              title: "Product",
              width: 220,
              render: (_, r) => (
                <Link href={`/admin/products/${r.product.id}`} className="flex items-center gap-2 min-w-0 text-ink hover:underline">
                  {r.product.images?.[0] ? (
                    <img src={r.product.images[0].url} alt="" className="w-9 h-11 rounded object-cover border border-app-border shrink-0" />
                  ) : (
                    <span className="w-9 h-11 rounded bg-app-bg border border-app-border shrink-0" />
                  )}
                  <span className="text-[13px] line-clamp-2">{r.product.title}</span>
                </Link>
              ),
            },
            {
              title: "Review",
              render: (_, r) => (
                <div className="max-w-[420px]">
                  <Stars value={r.rating} />
                  {r.title && <p className="m-0 mt-1 text-[13px] font-semibold text-ink">{r.title}</p>}
                  <p className="m-0 mt-0.5 text-[13px] text-ink-muted line-clamp-3 whitespace-pre-line">{r.body}</p>
                  {r.reply && (
                    <p className="m-0 mt-1.5 text-xs text-ink border-l-2 border-app-border pl-2">
                      <b>Your reply:</b> {r.reply}
                    </p>
                  )}
                </div>
              ),
            },
            {
              title: "By",
              render: (_, r) => (
                <div className="text-[13px]">
                  <p className="m-0 text-ink">{r.authorName}</p>
                  {r.authorEmail && <p className="m-0 text-xs text-ink-muted">{r.authorEmail}</p>}
                  <div className="flex gap-1 mt-1">
                    {r.verified && (
                      <Tag color="success" className="!mr-0 !text-[11px]">
                        Verified buyer
                      </Tag>
                    )}
                    {r.source === "import" && <Tag className="!mr-0 !text-[11px]">Imported</Tag>}
                  </div>
                </div>
              ),
            },
            { title: "Date", dataIndex: "createdAt", render: (d) => <span className="text-xs text-ink-muted whitespace-nowrap">{when(d)}</span> },
            {
              title: "",
              render: (_, r) => (
                <div className="flex items-center gap-1 justify-end">
                  {r.status !== "published" ? (
                    <Button size="small" type="primary" icon={<Check size={13} aria-hidden="true" />} onClick={() => setReviewStatus(r.id, "published")}>
                      Publish
                    </Button>
                  ) : (
                    <Tooltip title="Hide from the store">
                      <Button size="small" icon={<EyeOff size={13} aria-hidden="true" />} onClick={() => setReviewStatus(r.id, "hidden")} aria-label="Hide" />
                    </Tooltip>
                  )}
                  <Tooltip title={r.reply ? "Edit reply" : "Reply publicly"}>
                    <Button
                      size="small"
                      icon={<MessageSquareReply size={13} aria-hidden="true" />}
                      aria-label="Reply"
                      onClick={() => {
                        setReplying(r);
                        setReplyText(r.reply || "");
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="Delete">
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<Trash2 size={13} aria-hidden="true" />}
                      aria-label="Delete"
                      onClick={() =>
                        confirmDialog({
                          title: "Delete this review?",
                          description: "It's removed from the store for good.",
                          okText: "Delete",
                          danger: true,
                          onConfirm: async () => {
                            await apiFetch(`/api/reviews/${r.id}`, { method: "DELETE" });
                            load();
                          },
                        })
                      }
                    />
                  </Tooltip>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <SettingsModal open={settingsOpen} settings={data?.settings} onClose={() => setSettingsOpen(false)} onSaved={(s) => setData((d) => ({ ...d, settings: s }))} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
      <Modal open={Boolean(replying)} onCancel={() => setReplying(null)} title="Reply to this review" okText="Post reply" onOk={saveReply} destroyOnHidden>
        {replying && (
          <div className="flex flex-col gap-3 mt-2">
            <div className="rounded-lg bg-app-bg p-3">
              <Stars value={replying.rating} />
              <p className="m-0 mt-1 text-[13px] text-ink whitespace-pre-line">{replying.body}</p>
              <p className="m-0 mt-1 text-xs text-ink-muted">— {replying.authorName}</p>
            </div>
            <Input.TextArea value={replyText} onChange={(e) => setReplyText(e.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} maxLength={2000} placeholder="Thank them, or answer their question. Shown under the review on your store." />
            <p className="m-0 text-xs text-ink-muted">Leave it empty to remove your reply.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
