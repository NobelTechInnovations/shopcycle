"use client";

import { useCallback, useEffect, useState } from "react";
import { Table, Button, Drawer, Steps, Form, Input, Select, InputNumber, Radio, DatePicker, App, Alert, Tag, Space, Statistic, Empty, Progress, Modal, Descriptions } from "antd";
import { Plus, Send, FlaskConical, Users } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { WaPreview, money } from "./wa-ui";

const STATUS = { draft: ["default", "Draft"], scheduled: ["blue", "Scheduled"], sending: ["processing", "Sending"], sent: ["green", "Sent"], cancelled: ["default", "Cancelled"], failed: ["red", "Failed"] };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function Wizard({ open, onClose, templates, meta, onDone }) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState(null);
  const [testPhone, setTestPhone] = useState("");
  const [when, setWhen] = useState("now");
  const [at, setAt] = useState(null);
  const v = Form.useWatch([], form) || {};
  const tpl = templates.find((t) => `${t.name}|${t.language}` === v.template);

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ name: `Broadcast ${new Date().toLocaleDateString()}`, segment: "consented", variables: [] });
      setStep(0);
      setPreview(null);
      setSaved(null);
      setWhen("now");
      setAt(null);
    }
  }, [open, form]);

  const body = () => ({
    name: v.name,
    templateName: tpl?.name,
    templateLanguage: tpl?.language,
    variables: (v.variables || []).slice(0, tpl?.bodyVariables || 0),
    headerMediaUrl: v.headerMediaUrl || undefined,
    audience: { segment: v.segment, days: v.days, minOrders: v.minOrders },
  });

  async function runPreview() {
    setChecking(true);
    try {
      setPreview(await apiFetch("/api/whatsapp/broadcasts/preview", { method: "POST", body: body() }));
    } catch (err) {
      message.error(err.message);
      setPreview(null);
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    if (step === 1 && tpl) runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, v.segment, v.days, v.minOrders]);

  async function saveDraft() {
    const out = saved
      ? await apiFetch(`/api/whatsapp/broadcasts/${saved.id}`, { method: "PATCH", body: body() })
      : await apiFetch("/api/whatsapp/broadcasts", { method: "POST", body: body() });
    setSaved(out.broadcast);
    return out.broadcast;
  }

  async function test() {
    try {
      await apiFetch("/api/whatsapp/broadcasts/test", { method: "POST", body: { ...body(), phone: testPhone } });
      message.success("Test sent — check your WhatsApp");
    } catch (err) {
      message.error(err.message);
    }
  }

  function confirmSend() {
    modal.confirm({
      title: when === "now" ? `Send to ${preview?.recipients ?? 0} customers now?` : `Schedule for ${at?.format("D MMM, h:mm a")}?`,
      content: (
        <div className="text-sm">
          <p>
            Template <b>{tpl?.name}</b> ({tpl?.category.toLowerCase()}). Estimated cost {money(preview?.estimatedCost)} at {money(preview?.pricePerMessage)} per message, charged by Meta to your WhatsApp account&apos;s payment method.
          </p>
          <p className="m-0">Messages can&apos;t be unsent.</p>
        </div>
      ),
      okText: when === "now" ? "Send now" : "Schedule",
      onOk: async () => {
        try {
          const bc = await saveDraft();
          await apiFetch(`/api/whatsapp/broadcasts/${bc.id}/schedule`, { method: "POST", body: { confirm: true, scheduledAt: when === "later" ? at?.toISOString() : null } });
          message.success(when === "now" ? "Sending — it starts within a minute" : "Scheduled");
          onDone();
        } catch (err) {
          message.error(err.message);
        }
      },
    });
  }

  const canNext = [Boolean(tpl && v.name && (tpl.bodyVariables === 0 || (v.variables || []).slice(0, tpl.bodyVariables).every((x) => x?.source && (x.source !== "text" || x.value))) && (!tpl.mediaHeader || v.headerMediaUrl)), Boolean(preview?.recipients), true, when === "now" || at];

  const sampleValues = (v.variables || []).map((x) => (x?.source === "text" ? x.value : x?.source === "customer.first_name" ? "Asha" : x?.source === "customer.name" ? "Asha Verma" : x?.source === "store.name" ? "Your store" : x?.source === "store.url" ? "yourstore.com" : ""));

  return (
    <Drawer title="New broadcast" open={open} onClose={onClose} width={960} destroyOnClose>
      <Steps current={step} size="small" className="mb-6" items={[{ title: "Message" }, { title: "Audience" }, { title: "Test" }, { title: "Send" }]} />
      <div className="grid lg:grid-cols-[1fr_330px] gap-6">
        <Form form={form} layout="vertical" requiredMark={false}>
          <div className={step === 0 ? "" : "hidden"}>
            <Form.Item name="name" label="Name (only you see it)">
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item name="template" label="Template" extra="Only Meta-approved templates with a fixed button link can be broadcast.">
              <Select
                showSearch
                placeholder="Choose a template"
                options={templates.map((t) => ({ value: `${t.name}|${t.language}`, label: `${t.name} · ${t.language} · ${t.category.toLowerCase()}` }))}
                onChange={(val) => {
                  const t = templates.find((x) => `${x.name}|${x.language}` === val);
                  form.setFieldValue("variables", Array.from({ length: t?.bodyVariables || 0 }, (_, i) => ({ source: i === 0 ? "customer.first_name" : "text", value: "" })));
                }}
              />
            </Form.Item>
            {tpl &&
              Array.from({ length: tpl.bodyVariables }, (_, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr] gap-2">
                  <Form.Item name={["variables", i, "source"]} label={`{{${i + 1}}} is`}>
                    <Select options={meta.variableSources} />
                  </Form.Item>
                  {v.variables?.[i]?.source === "text" && (
                    <Form.Item name={["variables", i, "value"]} label="Text">
                      <Input maxLength={300} />
                    </Form.Item>
                  )}
                </div>
              ))}
            {tpl?.mediaHeader && (
              <Form.Item name="headerMediaUrl" label={`Header ${tpl.mediaHeader} link`} rules={[{ type: "url", message: "A full https:// link" }]}>
                <Input placeholder="https://…" />
              </Form.Item>
            )}
          </div>
          <div className={step === 1 ? "" : "hidden"}>
            <Form.Item name="segment" label="Who gets it">
              <Radio.Group className="flex flex-col gap-1">
                {Object.entries(meta.segments || {}).map(([k, label]) => (
                  <Radio key={k} value={k}>
                    {label}
                  </Radio>
                ))}
              </Radio.Group>
            </Form.Item>
            {v.segment === "lapsed" && (
              <Form.Item name="days" label="No order in the last (days)" initialValue={60}>
                <InputNumber min={7} max={730} />
              </Form.Item>
            )}
            <Form.Item name="minOrders" label="At least this many orders (optional)">
              <InputNumber min={0} max={100} />
            </Form.Item>
            <Alert
              type="info"
              showIcon
              icon={<Users size={16} aria-hidden="true" />}
              message="Only customers who agreed to WhatsApp messages get broadcasts"
              description="Anyone who replied STOP, is on your opt-out list, has no valid mobile number or appears twice is left out automatically."
            />
            {preview && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <Statistic title="Will receive" value={preview.recipients} />
                <Statistic title="Estimated cost" value={money(preview.estimatedCost)} />
                <Statistic title="Per message" value={money(preview.pricePerMessage)} />
                <Statistic title="Daily limit" value={preview.dailyLimit ?? "—"} />
              </div>
            )}
            {preview && (
              <p className="text-xs text-ink-muted mt-2">
                Matched {preview.matched}; left out: {preview.skipped.noConsent} without WhatsApp consent, {preview.skipped.optedOut} opted out, {preview.skipped.noPhone} without a valid number, {preview.skipped.duplicate} duplicates.
                Cost is Meta&apos;s published rate — Meta bills it directly.
              </p>
            )}
            {preview?.overLimit && <Alert type="warning" showIcon className="mt-2" message={`Your number can message ${preview.dailyLimit} new customers a day. The rest go out automatically over the next days.`} />}
            {preview && preview.recipients === 0 && <Alert type="warning" showIcon className="mt-2" message="Nobody in this audience can be messaged yet. Collect WhatsApp consent at checkout or mark customers who agreed." />}
          </div>
          <div className={step === 2 ? "" : "hidden"}>
            <p className="text-sm">Send it to your own WhatsApp first and check how it looks. Test messages use &quot;Test customer&quot; for customer names.</p>
            <Space.Compact className="w-full max-w-md">
              <Input placeholder="Your number, +91…" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
              <Button icon={<FlaskConical size={14} aria-hidden="true" />} disabled={testPhone.replace(/\D/g, "").length < 10} onClick={test}>
                Send test
              </Button>
            </Space.Compact>
          </div>
          <div className={step === 3 ? "" : "hidden"}>
            <Radio.Group value={when} onChange={(e) => setWhen(e.target.value)} className="flex flex-col gap-2">
              <Radio value="now">Send now</Radio>
              <Radio value="later">Schedule for later</Radio>
            </Radio.Group>
            {when === "later" && <DatePicker showTime={{ format: "h:mm a", minuteStep: 15 }} format="D MMM YYYY, h:mm a" className="mt-3" value={at} onChange={setAt} disabledDate={(d) => d && d.isBefore(new Date(), "day")} />}
            {preview && (
              <Descriptions size="small" column={1} className="mt-4" bordered>
                <Descriptions.Item label="Template">{tpl?.name}</Descriptions.Item>
                <Descriptions.Item label="Recipients">{preview.recipients}</Descriptions.Item>
                <Descriptions.Item label="Estimated cost">{money(preview.estimatedCost)}</Descriptions.Item>
              </Descriptions>
            )}
          </div>
        </Form>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">What customers see</p>
          {tpl ? <WaPreview header={tpl.header ? { type: tpl.header.format?.toLowerCase(), text: tpl.header.text } : null} body={tpl.body} footer={tpl.footer} buttons={tpl.buttons} values={sampleValues} /> : <p className="text-sm text-ink-muted">Choose a template.</p>}
          {preview?.sample?.length > 0 && step >= 1 && (
            <div className="mt-3 text-xs text-ink-muted">
              <p className="font-semibold m-0">For real recipients:</p>
              {preview.sample.map((s, i) => (
                <p key={i} className="m-0 mt-1">
                  <b>{s.to}:</b> {s.text}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-between mt-6">
        <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </Button>
        <Space>
          <Button
            onClick={async () => {
              try {
                await saveDraft();
                message.success("Draft saved");
                onDone();
              } catch (err) {
                message.error(err.message);
              }
            }}
            disabled={!tpl}
          >
            Save draft
          </Button>
          {step < 3 ? (
            <Button type="primary" disabled={!canNext[step] || checking} loading={checking} onClick={() => setStep(step + 1)}>
              Next
            </Button>
          ) : (
            <Button type="primary" icon={<Send size={14} aria-hidden="true" />} disabled={!canNext[3] || !preview?.recipients} onClick={confirmSend}>
              {when === "now" ? "Send" : "Schedule"}
            </Button>
          )}
        </Space>
      </div>
    </Drawer>
  );
}

function Report({ id, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!id) return;
    setData(null);
    apiFetch(`/api/whatsapp/broadcasts/${id}`).then(setData).catch(() => setData({ error: true }));
  }, [id]);
  const b = data?.broadcast;
  return (
    <Modal open={Boolean(id)} onCancel={onClose} footer={null} width={760} title={b?.name || "Broadcast"}>
      {!b ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {b.error && <Alert type={b.status === "failed" ? "error" : "warning"} showIcon message={b.error} />}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Statistic title="Sent" value={b.sent} suffix={`/ ${b.recipients}`} />
            <Statistic title="Delivered" value={b.delivered} suffix={<span className="text-xs">{pct(b.delivered, b.sent)}%</span>} />
            <Statistic title="Read" value={b.read} suffix={<span className="text-xs">{pct(b.read, b.delivered)}%</span>} />
            <Statistic title="Replied" value={b.replied} />
            <Statistic title="Failed" value={b.failed} />
            <Statistic title="Left out" value={b.skipped} />
            <Statistic title="Orders (7 days)" value={b.orders} />
            <Statistic title="Order value" value={money(b.revenue)} />
          </div>
          {b.status === "sending" && <Progress percent={pct(b.sent + b.failed, b.recipients)} />}
          <p className="text-xs text-ink-muted m-0">
            Delivered, read and failed come from WhatsApp. Orders are your store&apos;s own orders from recipients within 7 days of their message — they may have bought for other reasons too.
          </p>
          {data.problems?.length > 0 && (
            <Table
              size="small"
              rowKey={(r) => r.phone}
              pagination={false}
              dataSource={data.problems}
              columns={[
                { title: "Customer", render: (_, r) => r.name || `+${r.phone}` },
                { title: "", dataIndex: "status", render: (s) => <Tag color={s === "failed" ? "red" : "default"}>{s === "failed" ? "Not delivered" : "Left out"}</Tag> },
                { title: "Why", render: (_, r) => r.error || r.skipReason },
              ]}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Broadcasts({ canEdit }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({});
  const [templates, setTemplates] = useState([]);
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch("/api/whatsapp/broadcasts");
      setRows(d.broadcasts);
      setMeta({ segments: d.segments, variableSources: d.variableSources });
    } catch (err) {
      setRows([]);
      message.error(err.message);
    }
  }, [message]);
  useEffect(() => {
    load();
    apiFetch("/api/whatsapp/templates?status=approved").then((d) => setTemplates(d.templates)).catch(() => {});
  }, [load]);
  useEffect(() => {
    if (!rows?.some((r) => r.status === "sending" || r.status === "scheduled")) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [rows, load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between gap-2 flex-wrap">
        <p className="text-sm text-ink-muted m-0 max-w-2xl">Send an approved template to a group of customers who agreed to hear from you on WhatsApp. Delivery, reads, replies and the orders that followed are tracked.</p>
        {canEdit && (
          <Button type="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={() => setOpen(true)} disabled={!templates.length}>
            New broadcast
          </Button>
        )}
      </div>
      {!templates.length && rows !== null && <Alert type="info" showIcon message="You need at least one approved template first — create one in the Templates tab." />}
      <Table
        rowKey="id"
        loading={rows === null}
        dataSource={rows || []}
        scroll={{ x: 820 }}
        onRow={(r) => ({ onClick: () => r.status !== "draft" && setReport(r.id), className: r.status !== "draft" ? "cursor-pointer" : "" })}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No broadcasts yet." /> }}
        columns={[
          { title: "Name", dataIndex: "name", render: (v, r) => <span className="font-medium">{v}<span className="block text-xs text-ink-muted font-normal">{r.templateName}</span></span> },
          { title: "Status", dataIndex: "status", render: (s, r) => <Tag color={STATUS[s]?.[0]}>{STATUS[s]?.[1] || s}{s === "scheduled" && r.scheduledAt ? ` · ${new Date(r.scheduledAt).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}</Tag> },
          { title: "Sent", render: (_, r) => (r.recipients ? `${r.sent}/${r.recipients}` : "—") },
          { title: "Delivered", render: (_, r) => (r.sent ? `${pct(r.delivered, r.sent)}%` : "—") },
          { title: "Read", render: (_, r) => (r.delivered ? `${pct(r.read, r.delivered)}%` : "—") },
          { title: "Replies", dataIndex: "replied" },
          { title: "Orders", render: (_, r) => (r.orders ? `${r.orders} · ${money(r.revenue)}` : "—") },
          {
            title: "",
            align: "right",
            render: (_, r) =>
              canEdit && ["draft", "scheduled", "sending"].includes(r.status) ? (
                <Button
                  size="small"
                  danger
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await apiFetch(`/api/whatsapp/broadcasts/${r.id}/cancel`, { method: "POST" });
                      load();
                    } catch (err) {
                      message.error(err.message);
                    }
                  }}
                >
                  {r.status === "sending" ? "Stop" : "Cancel"}
                </Button>
              ) : null,
          },
        ]}
      />
      <Wizard
        open={open}
        onClose={() => setOpen(false)}
        // Broadcasts can't fill a per-customer link, so those templates are left out.
        templates={templates.filter((t) => t.urlButtonVariable < 0)}
        meta={meta}
        onDone={() => {
          setOpen(false);
          load();
        }}
      />
      <Report id={report} onClose={() => setReport(null)} />
    </div>
  );
}
