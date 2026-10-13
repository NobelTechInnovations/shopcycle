"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Table, Button, Drawer, Form, Input, Select, Segmented, Space, App, Alert, Tag, Popconfirm, Upload, Empty, Dropdown, Tooltip } from "antd";
import { Plus, RefreshCw, Trash2, Pencil, Upload as UploadIcon, Braces, Sparkles } from "lucide-react";

/**
 * WhatsApp message templates on one WhatsApp Business account: list,
 * build (with a live preview), submit for Meta's review, edit, delete.
 * Shared by the seller admin (the store's own account, /api/whatsapp) and
 * Super admin (Oyklane's account, /api/super-admin/messaging/platform).
 * A list response with `managed: true` is read-only (a store on Oyklane's
 * shared number sees Oyklane's templates but can't change them).
 */

const STATUS_COLOR = { APPROVED: "green", PENDING: "blue", IN_APPEAL: "blue", REJECTED: "red", PAUSED: "orange", DISABLED: "default", LIMIT_EXCEEDED: "orange" };
export function TemplateStatus({ status }) {
  const label = { APPROVED: "Approved", PENDING: "In review", REJECTED: "Rejected", PAUSED: "Paused by Meta", DISABLED: "Disabled", IN_APPEAL: "Appealed" }[status] || status;
  return <Tag color={STATUS_COLOR[status] || "default"}>{label}</Tag>;
}

/** WhatsApp-style bubble preview of a template (or a message). */
export function WaPreview({ header, body, footer, buttons = [], values = [] }) {
  const fill = (t) => String(t || "").replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => values[Number(n) - 1] || `{{${n}}}`);
  return (
    <div className="rounded-xl p-3" style={{ background: "#e5ddd5" }}>
      <div className="bg-white rounded-lg shadow-sm max-w-[320px] overflow-hidden text-[13.5px] leading-snug">
        {header?.type && header.type !== "none" && header.type !== "text" && (
          <div className="bg-gray-200 h-32 grid place-items-center text-xs text-gray-500 uppercase tracking-wide">{header.type}</div>
        )}
        <div className="px-2.5 pt-2 pb-1">
          {header?.type === "text" && header.text && <p className="font-semibold m-0 mb-1">{fill(header.text)}</p>}
          <p className="m-0 whitespace-pre-wrap break-words">{fill(body) || <span className="text-gray-400">Your message appears here</span>}</p>
          {footer && <p className="m-0 mt-1 text-[11.5px] text-gray-500">{footer}</p>}
          <p className="m-0 text-right text-[10.5px] text-gray-400">12:00</p>
        </div>
        {buttons.length > 0 && (
          <div className="border-t border-gray-100">
            {buttons.map((b, i) => (
              <div key={i} className="text-center text-sky-600 text-[13px] py-2 border-b border-gray-100 last:border-b-0">
                {b.type === "COPY_CODE" ? "Copy code" : b.text || "Button"}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const LANGUAGES = [
  ["en", "English"],
  ["en_US", "English (US)"],
  ["en_GB", "English (UK)"],
  ["hi", "Hindi"],
  ["mr", "Marathi"],
  ["gu", "Gujarati"],
  ["bn", "Bengali"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["kn", "Kannada"],
  ["ml", "Malayalam"],
  ["pa", "Punjabi"],
  ["ur", "Urdu"],
].map(([value, label]) => ({ value, label }));

/** Ready-made starting points — the seller edits and submits them. */
const STARTERS = [
  {
    key: "order_confirmed",
    label: "Order confirmation",
    values: { name: "order_confirmed", category: "UTILITY", body: "Hi {{1}}, thanks for your order {{2}}! We've received it and will let you know when it ships.", examples: ["Asha", "#1042"], footer: "", buttons: [{ type: "URL", text: "View order", url: "https://yourstore.com/orders/{{1}}", example: "https://yourstore.com/orders/abc123" }] },
  },
  {
    key: "order_shipped",
    label: "Shipping update",
    values: { name: "order_shipped", category: "UTILITY", body: "Good news {{1}}! Your order {{2}} is on its way with {{3}}. Track it with the button below.", examples: ["Asha", "#1042", "Delhivery"], buttons: [{ type: "URL", text: "Track order", url: "https://yourstore.com/track/{{1}}", example: "https://yourstore.com/track/123" }] },
  },
  {
    key: "payment_reminder",
    label: "Payment reminder",
    values: { name: "payment_pending", category: "UTILITY", body: "Hi {{1}}, your order {{2}} is waiting for payment. Complete it to confirm your order.", examples: ["Asha", "#1042"], buttons: [{ type: "URL", text: "Pay now", url: "https://yourstore.com/pay/{{1}}", example: "https://yourstore.com/pay/abc" }] },
  },
  {
    key: "cart_reminder",
    label: "Abandoned checkout",
    values: { name: "checkout_reminder", category: "MARKETING", body: "Hi {{1}}, you left something in your cart at {{2}}. It's still saved for you — finish your order whenever you're ready.", examples: ["Asha", "Sonchiri Sweets"], footer: "Reply STOP to opt out", buttons: [{ type: "URL", text: "Complete order", url: "https://yourstore.com/checkout/{{1}}", example: "https://yourstore.com/checkout/abc" }] },
  },
  {
    key: "feedback",
    label: "Feedback request",
    values: { name: "delivery_feedback", category: "MARKETING", body: "Hi {{1}}, we hope you're enjoying your order! Could you take a minute to tell us how we did?", examples: ["Asha"], footer: "Reply STOP to opt out", buttons: [{ type: "QUICK_REPLY", text: "Loved it" }, { type: "QUICK_REPLY", text: "Could be better" }] },
  },
  {
    key: "reorder",
    label: "Reorder reminder",
    values: { name: "reorder_reminder", category: "MARKETING", body: "Hi {{1}}, running low on {{2}}? Reorder in a few taps and we'll ship it right away.", examples: ["Asha", "Kaju Katli"], footer: "Reply STOP to opt out", buttons: [{ type: "URL", text: "Reorder", url: "https://yourstore.com" }] },
  },
  {
    key: "offer",
    label: "Festive offer",
    values: { name: "festive_offer", category: "MARKETING", body: "Hi {{1}}, our festive sale is live! Get {{2}} off on everything this week only.", examples: ["Asha", "20%"], footer: "Reply STOP to opt out", buttons: [{ type: "COPY_CODE", example: "FESTIVE20" }, { type: "URL", text: "Shop now", url: "https://yourstore.com" }] },
  },
];

const nextVar = (text) => {
  const used = [...String(text || "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return (used.length ? Math.max(...used) : 0) + 1;
};

function Builder({ api, open, onClose, editing, initial, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const v = Form.useWatch([], form) || {};

  useEffect(() => {
    if (!open) return;
    setErrors([]);
    form.resetFields();
    if (editing) {
      const comp = (t) => editing.components.find((c) => c.type === t);
      const h = comp("HEADER");
      form.setFieldsValue({
        name: editing.name,
        category: editing.category,
        language: editing.language,
        headerType: h ? h.format.toLowerCase() : "none",
        headerText: h?.text,
        headerExample: h?.example?.header_text?.[0],
        body: comp("BODY")?.text,
        examples: comp("BODY")?.example?.body_text?.[0] || [],
        footer: comp("FOOTER")?.text,
        buttons: (comp("BUTTONS")?.buttons || []).map((b) => ({ type: b.type, text: b.text, url: b.url, phone: b.phone_number, example: Array.isArray(b.example) ? b.example[0] : b.example })),
      });
    } else {
      form.setFieldsValue({ category: "UTILITY", language: "en", headerType: "none", examples: [], buttons: [], ...(initial || {}) });
    }
  }, [open, editing, initial, form]);

  const varCount = Math.max(0, nextVar(v.body) - 1);
  const spec = () => ({
    name: v.name,
    category: v.category,
    language: v.language,
    header: { type: v.headerType, text: v.headerText, example: v.headerExample, sampleHandle: v.sampleHandle },
    body: { text: v.body, examples: v.examples || [] },
    footer: { text: v.footer || "" },
    buttons: (v.buttons || []).filter(Boolean),
    categoryChange: editing && editing.category !== v.category,
  });

  async function submit() {
    setBusy(true);
    setErrors([]);
    try {
      await api.fetch(`${api.base}/templates/validate`, { method: "POST", body: spec() });
      if (editing) await api.fetch(`${api.base}/templates/${editing.id}`, { method: "POST", body: spec() });
      else await api.fetch(`${api.base}/templates`, { method: "POST", body: spec() });
      message.success(editing ? "Changes sent to Meta for review" : "Sent to Meta for review — usually decided within minutes, sometimes up to 24 hours");
      onSaved();
    } catch (err) {
      setErrors(err.details?.errors || [err.message]);
    } finally {
      setBusy(false);
    }
  }

  async function uploadSample({ file }) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${api.url}${api.base}/templates/sample`, { method: "POST", credentials: "include", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      form.setFieldValue("sampleHandle", data.handle);
      message.success("Sample uploaded");
    } catch (err) {
      message.error(err.message);
    }
  }

  return (
    <Drawer
      title={editing ? `Edit ${editing.name}` : "New template"}
      open={open}
      onClose={onClose}
      width={980}
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={busy} onClick={submit}>
            {editing ? "Resubmit for review" : "Submit for review"}
          </Button>
        </Space>
      }
    >
      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <Form form={form} layout="vertical" requiredMark={false}>
          {errors.length > 0 && <Alert type="error" showIcon className="mb-4" message="Meta would reject this — fix these first" description={<ul className="m-0 pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul>} />}
          <div className="grid sm:grid-cols-3 gap-3">
            <Form.Item name="name" label="Name" extra="lowercase_with_underscores" className="sm:col-span-1">
              <Input disabled={Boolean(editing)} placeholder="order_shipped" onChange={(e) => form.setFieldValue("name", e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_"))} />
            </Form.Item>
            <Form.Item name="category" label="Category" extra={v.category === "MARKETING" ? "Offers, announcements, reminders to buy" : "Updates about an order or account"}>
              <Select options={[{ value: "UTILITY", label: "Utility" }, { value: "MARKETING", label: "Marketing" }]} />
            </Form.Item>
            <Form.Item name="language" label="Language">
              <Select showSearch disabled={Boolean(editing)} options={LANGUAGES} optionFilterProp="label" />
            </Form.Item>
          </div>
          <Form.Item name="headerType" label="Header">
            <Segmented options={[{ value: "none", label: "None" }, { value: "text", label: "Text" }, { value: "image", label: "Image" }, { value: "video", label: "Video" }, { value: "document", label: "PDF" }]} />
          </Form.Item>
          {v.headerType === "text" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Form.Item name="headerText" label="Header text" extra="Up to 60 characters, one {{1}} at most">
                <Input maxLength={60} showCount />
              </Form.Item>
              {/\{\{1\}\}/.test(v.headerText || "") && (
                <Form.Item name="headerExample" label="Sample for {{1}}">
                  <Input />
                </Form.Item>
              )}
            </div>
          )}
          {["image", "video", "document"].includes(v.headerType) && (
            <Form.Item label={`Sample ${v.headerType}`} extra="Meta reviews the template with this sample. When sending, you'll give the real file's link.">
              <Form.Item name="sampleHandle" noStyle>
                <Input type="hidden" />
              </Form.Item>
              <Upload showUploadList={false} customRequest={uploadSample} accept={v.headerType === "image" ? "image/jpeg,image/png" : v.headerType === "video" ? "video/mp4" : "application/pdf"}>
                <Button icon={<UploadIcon size={14} aria-hidden="true" />}>{v.sampleHandle ? "Replace sample" : "Upload sample"}</Button>
              </Upload>
              {v.sampleHandle && <Tag color="green" className="ml-2">Uploaded</Tag>}
            </Form.Item>
          )}
          <Form.Item
            name="body"
            label={
              <span className="flex items-center gap-2">
                Message
                <Button
                  size="small"
                  type="link"
                  icon={<Braces size={13} aria-hidden="true" />}
                  onClick={() => form.setFieldValue("body", `${v.body || ""}{{${nextVar(v.body)}}}`)}
                >
                  Add variable
                </Button>
              </span>
            }
            extra="Variables like {{1}} are filled per customer (name, order number…). Not at the very start or end, and with words between them."
          >
            <Input.TextArea rows={5} maxLength={1024} showCount />
          </Form.Item>
          {varCount > 0 && (
            <div className="grid sm:grid-cols-3 gap-3">
              {Array.from({ length: varCount }, (_, i) => (
                <Form.Item key={i} name={["examples", i]} label={`Sample for {{${i + 1}}}`}>
                  <Input placeholder={i === 0 ? "Asha" : ""} />
                </Form.Item>
              ))}
            </div>
          )}
          <Form.Item name="footer" label="Footer (optional)" extra={v.category === "MARKETING" ? "Tip: \"Reply STOP to opt out\" — Oyklane honours it automatically." : null}>
            <Input maxLength={60} showCount />
          </Form.Item>
          <Form.List name="buttons">
            {(fields, { add, remove }) => (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Buttons (optional)</span>
                  <Dropdown
                    menu={{
                      items: [
                        { key: "QUICK_REPLY", label: "Quick reply" },
                        { key: "URL", label: "Visit website" },
                        { key: "PHONE_NUMBER", label: "Call phone number" },
                        { key: "COPY_CODE", label: "Copy offer code" },
                      ],
                      onClick: ({ key }) => add({ type: key }),
                    }}
                  >
                    <Button size="small" icon={<Plus size={13} aria-hidden="true" />} disabled={fields.length >= 10}>
                      Add button
                    </Button>
                  </Dropdown>
                </div>
                {fields.map((f) => {
                  const type = v.buttons?.[f.name]?.type;
                  return (
                    <div key={f.key} className="grid grid-cols-[110px_1fr_1fr_auto] gap-2 items-start">
                      <Form.Item name={[f.name, "type"]} noStyle>
                        <Select size="small" disabled options={[{ value: "QUICK_REPLY", label: "Quick reply" }, { value: "URL", label: "Website" }, { value: "PHONE_NUMBER", label: "Call" }, { value: "COPY_CODE", label: "Offer code" }]} />
                      </Form.Item>
                      {type !== "COPY_CODE" ? (
                        <Form.Item name={[f.name, "text"]} noStyle>
                          <Input size="small" placeholder="Button label" maxLength={25} />
                        </Form.Item>
                      ) : (
                        <span />
                      )}
                      {type === "URL" && (
                        <Form.Item name={[f.name, "url"]} noStyle>
                          <Input size="small" placeholder="https://yourstore.com/… (end with {{1}} for a per-customer link)" />
                        </Form.Item>
                      )}
                      {type === "PHONE_NUMBER" && (
                        <Form.Item name={[f.name, "phone"]} noStyle>
                          <Input size="small" placeholder="+91 98765 43210" />
                        </Form.Item>
                      )}
                      {type === "COPY_CODE" && (
                        <Form.Item name={[f.name, "example"]} noStyle>
                          <Input size="small" placeholder="Sample code, e.g. FESTIVE20" />
                        </Form.Item>
                      )}
                      {type === "QUICK_REPLY" && <span />}
                      <Button size="small" type="text" danger icon={<Trash2 size={13} aria-hidden="true" />} onClick={() => remove(f.name)} aria-label="Remove button" />
                      {type === "URL" && /\{\{1\}\}$/.test(v.buttons?.[f.name]?.url || "") && (
                        <Form.Item name={[f.name, "example"]} className="col-span-4 !mb-0">
                          <Input size="small" placeholder="Sample full link for review" />
                        </Form.Item>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Form.List>
        </Form>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Preview</p>
          <WaPreview header={{ type: v.headerType, text: v.headerText }} body={v.body} footer={v.footer} buttons={(v.buttons || []).filter(Boolean)} values={v.examples || []} />
          <p className="text-xs text-ink-muted mt-3">
            Meta checks every template before it can be sent. Utility templates must be about something the customer did (an order, a payment). Anything promotional is
            Marketing, costs more per message and needs the customer&apos;s WhatsApp opt-in.
          </p>
        </div>
      </div>
    </Drawer>
  );
}

export function WaTemplates({ apiFetch, apiUrl, base = "/api/whatsapp", canEdit, managedNotice = null, starters = STARTERS, emptyText = "No templates yet. Start from a ready-made one — order updates, shipping, reminders." }) {
  const { message } = App.useApp();
  const api = useMemo(() => ({ fetch: apiFetch, url: apiUrl, base }), [apiFetch, apiUrl, base]);
  const [rows, setRows] = useState(null);
  const [managed, setManaged] = useState(false);
  const [error, setError] = useState(null);
  const [builder, setBuilder] = useState({ open: false });
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch(`${base}/templates`);
      setRows(data.templates || []);
      setManaged(Boolean(data.managed));
    } catch (err) {
      setError(err.message);
      setRows([]);
    }
  }, [apiFetch, base]);
  useEffect(() => {
    load();
  }, [load]);

  const editable = canEdit && !managed;
  const shown = (rows || []).filter((t) => filter === "all" || (filter === "attention" ? ["REJECTED", "PAUSED", "DISABLED"].includes(t.status) : t.status === filter));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 justify-between">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All${rows ? ` (${rows.length})` : ""}` },
            { value: "APPROVED", label: "Approved" },
            { value: "PENDING", label: "In review" },
            { value: "attention", label: "Needs attention" },
          ]}
        />
        <Space wrap>
          <Button icon={<RefreshCw size={14} aria-hidden="true" />} onClick={load}>
            Refresh
          </Button>
          {editable && starters.length > 0 && (
            <Dropdown menu={{ items: starters.map((s) => ({ key: s.key, label: s.label })), onClick: ({ key }) => setBuilder({ open: true, initial: starters.find((s) => s.key === key).values }) }}>
              <Button icon={<Sparkles size={14} aria-hidden="true" />}>Start from a ready-made one</Button>
            </Dropdown>
          )}
          {editable && (
            <Button type="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={() => setBuilder({ open: true })}>
              New template
            </Button>
          )}
        </Space>
      </div>
      {managed && managedNotice}
      {error && <Alert type="error" showIcon message="Couldn't load templates from Meta" description={error} />}
      <Table
        rowKey={(t) => t.id}
        loading={rows === null}
        dataSource={shown}
        size="middle"
        scroll={{ x: 720 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} /> }}
        expandable={{
          expandedRowRender: (t) => (
            <div className="grid md:grid-cols-[1fr_320px] gap-4">
              <div className="text-sm">
                {t.status === "REJECTED" && <Alert type="error" showIcon className="mb-3" message={`Rejected${t.rejectedReason && t.rejectedReason !== "NONE" ? ` — ${t.rejectedReason.replace(/_/g, " ").toLowerCase()}` : ""}`} description={t.fix} />}
                {t.status === "PAUSED" && <Alert type="warning" showIcon className="mb-3" message="Meta paused this template because customers reported or blocked it. Improve it or send it less often." />}
                <p className="m-0 text-ink-muted">Category: {t.category.toLowerCase()} · Language: {t.language} · Variables: {t.bodyVariables}</p>
              </div>
              <WaPreview header={t.header ? { type: t.header.format?.toLowerCase(), text: t.header.text } : null} body={t.body} footer={t.footer} buttons={t.buttons} />
            </div>
          ),
        }}
        columns={[
          { title: "Name", dataIndex: "name", render: (v) => <span className="font-medium">{v}</span> },
          { title: "Category", dataIndex: "category", render: (v) => <Tag>{v.toLowerCase()}</Tag> },
          { title: "Language", dataIndex: "language" },
          { title: "Status", dataIndex: "status", render: (v) => <TemplateStatus status={v} /> },
          { title: "Quality", dataIndex: "quality", render: (v) => (v && v !== "UNKNOWN" ? <Tag color={v === "GREEN" ? "green" : v === "YELLOW" ? "gold" : "red"}>{v.toLowerCase()}</Tag> : <span className="text-ink-muted">—</span>) },
          {
            title: "",
            key: "actions",
            align: "right",
            render: (_, t) =>
              editable && (
                <Space>
                  <Tooltip title={t.status === "PENDING" ? "Wait for Meta's decision before editing" : "Edit and resubmit"}>
                    <Button size="small" icon={<Pencil size={13} aria-hidden="true" />} disabled={t.status === "PENDING"} onClick={() => setBuilder({ open: true, editing: t })} aria-label="Edit" />
                  </Tooltip>
                  <Popconfirm
                    title={`Delete ${t.name}?`}
                    description="Every language of it is deleted at Meta. The name can't be reused for 30 days."
                    okButtonProps={{ danger: true }}
                    onConfirm={async () => {
                      try {
                        await apiFetch(`${base}/templates/${encodeURIComponent(t.name)}`, { method: "DELETE" });
                        message.success("Deleted");
                        load();
                      } catch (err) {
                        message.error(err.message);
                      }
                    }}
                  >
                    <Button size="small" danger icon={<Trash2 size={13} aria-hidden="true" />} aria-label="Delete" />
                  </Popconfirm>
                </Space>
              ),
          },
        ]}
      />
      <Builder
        api={api}
        open={builder.open}
        editing={builder.editing}
        initial={builder.initial ? { ...builder.initial, examples: builder.initial.examples, headerType: "none" } : null}
        onClose={() => setBuilder({ open: false })}
        onSaved={() => {
          setBuilder({ open: false });
          load();
        }}
      />
    </div>
  );
}
