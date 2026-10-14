"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Input, Segmented, Badge, Button, Empty, Tag, Select, App, Tooltip, Modal, Form, Switch, Upload, Spin, Alert } from "antd";
import { Search, Paperclip, Sparkles, Send, ArrowLeft, StickyNote, UserRound, Clock, FileText, Lock, MessageSquarePlus } from "lucide-react";
import { apiFetch, API_URL } from "@/lib/api";
import { Ticks, WaPreview, relTime, money } from "./wa-ui";

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "unread", label: "Unread" },
  { value: "mine", label: "Mine" },
  { value: "none", label: "Unassigned" },
  { value: "closed", label: "Closed" },
];

function filterQuery(filter) {
  if (filter === "unread") return "status=open&unread=true";
  if (filter === "mine") return "status=open&assigned=me";
  if (filter === "none") return "status=open&assigned=none";
  if (filter === "closed") return "status=closed";
  return "status=open";
}

const displayName = (c) => c.customer?.name || c.profileName || `+${c.phone}`;

/** Values a template can be filled with (names from the API's composeContext). */
const FILLS = [
  ["customer.first_name", "First name"],
  ["customer.name", "Full name"],
  ["order.number", "Order no."],
  ["order.total", "Total"],
  ["order.courier", "Courier"],
  ["order.tracking", "Tracking no."],
  ["store.name", "Store"],
];

/** Fills each {{n}}: Oyklane's standard templates say exactly what goes
 * where; for the store's own, the words just before {{n}} are the clue. */
function guessValues(tpl, ctx) {
  const v = ctx?.values || {};
  const known = ctx?.standard?.[tpl.name];
  if (known) return known.map((key) => v[key] || "");
  return Array.from({ length: tpl.bodyVariables || 0 }, (_, i) => {
    const before = String(tpl.body || "").split(`{{${i + 1}}}`)[0].slice(-28).toLowerCase();
    if (/(hi|hello|hey|dear|namaste)[\s,]*$/.test(before)) return v["customer.first_name"] || "";
    if (/(order|order no\.?|#)\s*$/.test(before)) return v["order.number"] || "";
    if (/(₹|rs\.?|inr|total|amount)( is| of)?\s*:?\s*$/.test(before)) return v["order.total"] || "";
    if (/(tracking|awb|track)( number| no\.?| id)?\s*:?\s*$/.test(before)) return v["order.tracking"] || "";
    if (/(with|via|courier)\s*$/.test(before)) return v["order.courier"] || "";
    if (/(from|at|team)\s*$/.test(before)) return v["store.name"] || "";
    return i === 0 ? v["customer.first_name"] || "" : "";
  });
}

/**
 * Sends one approved template — the only way to message outside the
 * 24-hour window. `query` ("customerId=…" or "phone=…") loads the
 * customer's orders: the latest is picked, and the template's values are
 * filled in from it (all still editable).
 */
function TemplateComposer({ open, onClose, onSend, templates, query, title = "Send a template" }) {
  const [form] = Form.useForm();
  const [picked, setPicked] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [busy, setBusy] = useState(false);
  const values = Form.useWatch("body", form) || [];
  useEffect(() => {
    if (!open) {
      setPicked(null);
      setCtx(null);
      setOrderId(null);
      form.resetFields();
    }
  }, [open, form]);
  useEffect(() => {
    if (!open || !query) return;
    apiFetch(`/api/whatsapp/compose?${query}${orderId ? `&orderId=${orderId}` : ""}`)
      .then(setCtx)
      .catch(() => setCtx(null));
  }, [open, query, orderId]);
  const tpl = templates.find((t) => `${t.name}|${t.language}` === picked);
  // A new order or template: fill everything in again.
  useEffect(() => {
    if (!tpl) return;
    form.setFieldValue("body", guessValues(tpl, ctx));
    if (tpl.urlButtonVariable >= 0) form.setFieldValue("buttonUrl", ctx?.buttonValue || "");
  }, [tpl, ctx, form]);
  const fills = FILLS.filter(([key]) => ctx?.values?.[key]);

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      okText="Send"
      confirmLoading={busy}
      okButtonProps={{ disabled: !tpl }}
      onOk={() =>
        form.validateFields().then(async (v) => {
          setBusy(true);
          try {
            await onSend({ templateName: tpl.name, language: tpl.language, body: v.body || [], headerMediaUrl: v.headerMediaUrl, buttonUrl: v.buttonUrl, confirmConsent: v.confirmConsent });
          } finally {
            setBusy(false);
          }
        })
      }
      width={760}
    >
      <div className="grid md:grid-cols-2 gap-4">
        <Form form={form} layout="vertical" requiredMark={false}>
          {ctx?.orders?.length > 0 && (
            <Form.Item label="About which order" extra="The latest is picked; the message is filled in from it.">
              <Select
                value={ctx.orderId}
                onChange={setOrderId}
                options={ctx.orders.map((o) => ({ value: o.id, label: `${o.number} · ${o.total} · ${String(o.status || "").replace(/_/g, " ")} · ${new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` }))}
              />
            </Form.Item>
          )}
          <Form.Item label="Template">
            <Select
              showSearch
              placeholder="Choose an approved template"
              value={picked}
              onChange={setPicked}
              optionFilterProp="label"
              options={templates.map((t) => ({ value: `${t.name}|${t.language}`, label: `${t.name} · ${t.language} · ${t.category.toLowerCase()}` }))}
              notFoundContent="No approved templates yet."
            />
          </Form.Item>
          {tpl &&
            Array.from({ length: tpl.bodyVariables }, (_, i) => (
              <Form.Item
                key={i}
                name={["body", i]}
                label={`Value for {{${i + 1}}}`}
                rules={[{ required: true, whitespace: true, message: "Fill this in — WhatsApp won't send an empty value" }]}
                extra={
                  fills.length > 0 && (
                    <span className="flex flex-wrap gap-1 mt-1">
                      {fills.map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          className="text-[11px] px-1.5 py-0.5 rounded border border-app-border bg-app-surface hover:border-accent hover:text-accent"
                          onClick={() => form.setFieldValue(["body", i], ctx.values[key])}
                        >
                          {label}
                        </button>
                      ))}
                    </span>
                  )
                }
              >
                <Input maxLength={300} />
              </Form.Item>
            ))}
          {tpl?.mediaHeader && (
            <Form.Item name="headerMediaUrl" label={`${tpl.mediaHeader} link (https://…)`} rules={[{ required: true, type: "url", message: "A full https:// link" }]}>
              <Input />
            </Form.Item>
          )}
          {tpl?.urlButtonVariable >= 0 && (
            <Form.Item name="buttonUrl" label="End of the button's link" extra={ctx?.buttonValue ? "Filled with the order's page." : null} rules={[{ required: true, message: "Required" }]}>
              <Input placeholder="for example ORDER-1042" />
            </Form.Item>
          )}
          {tpl?.category === "MARKETING" && (
            <Form.Item name="confirmConsent" valuePropName="checked" extra="Marketing templates need the customer's permission to message them on WhatsApp.">
              <Switch checkedChildren="Customer agreed" unCheckedChildren="Not confirmed" />
            </Form.Item>
          )}
        </Form>
        <div>{tpl ? <WaPreview header={tpl.header ? { type: tpl.header.format?.toLowerCase(), text: tpl.header.text } : null} body={tpl.body} footer={tpl.footer} buttons={tpl.buttons} values={values} /> : <p className="text-sm text-ink-muted">Pick a template to preview it.</p>}</div>
      </div>
    </Modal>
  );
}

const COUNTRIES = [
  ["91", "India +91"],
  ["971", "UAE +971"],
  ["1", "US/Canada +1"],
  ["44", "UK +44"],
  ["65", "Singapore +65"],
  ["61", "Australia +61"],
  ["966", "Saudi +966"],
  ["977", "Nepal +977"],
];

/** A typed number → { e164 } or { error } in plain words (null while empty). */
function checkNumber(cc, raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return { error: null, e164: null };
  if (d.startsWith(cc) && d.length > (cc === "91" ? 10 : 9)) d = d.slice(cc.length);
  d = d.replace(/^0+/, "");
  if (cc === "91") {
    if (d.length < 10) return { error: `Enter all 10 digits — ${d.length} so far.` };
    if (d.length > 10) return { error: "That's more than 10 digits. Leave out +91 and any 0 in front." };
    if (!/^[6-9]/.test(d)) return { error: "Indian mobile numbers start with 6, 7, 8 or 9." };
    return { e164: `91${d}` };
  }
  if (d.length < 6 || d.length > 13) return { error: "Enter the number without the country code (6–13 digits)." };
  return { e164: `${cc}${d}` };
}

/**
 * Messaging someone new: pick a customer (their number and orders come
 * with them) or type a number — checked as it's typed. Then a template,
 * filled in from the chosen order. An existing chat opens instead.
 */
function NewConversation({ open, onClose, templates, onStarted, preset }) {
  const { message } = App.useApp();
  const [step, setStep] = useState("who");
  const [mode, setMode] = useState("customer");
  const [options, setOptions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [customerId, setCustomerId] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [cc, setCc] = useState("91");
  const [num, setNum] = useState("");
  const [touched, setTouched] = useState(false);
  const searchTimer = useRef(null);

  const search = useCallback((q) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const d = await apiFetch(`/api/whatsapp/customers?q=${encodeURIComponent(q || "")}`);
        setOptions(d.customers);
      } catch {
        setOptions([]);
      } finally {
        setSearching(false);
      }
    }, q ? 250 : 0);
  }, []);

  useEffect(() => {
    if (!open) {
      setStep("who");
      setMode("customer");
      setCustomerId(null);
      setCtx(null);
      setNum("");
      setTouched(false);
      return;
    }
    search("");
    if (preset?.customerId) {
      setMode("customer");
      setCustomerId(preset.customerId);
    } else if (preset?.phone) {
      setMode("number");
      setNum(String(preset.phone).replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""));
    }
  }, [open, preset, search]);

  const typed = mode === "number" ? checkNumber(cc, num) : null;
  const phone = mode === "customer" ? ctx?.phone : typed?.e164;
  // The chosen customer, or the typed number: its context (and any chat already open with it).
  useEffect(() => {
    const q = mode === "customer" ? (customerId ? `customerId=${customerId}` : null) : phone ? `phone=${phone}` : null;
    if (!open || !q) return setCtx(null);
    let live = true;
    apiFetch(`/api/whatsapp/compose?${q}`)
      .then((d) => live && setCtx(d))
      .catch(() => live && setCtx(null));
    return () => {
      live = false;
    };
  }, [open, mode, customerId, phone]);

  const picked = options.find((o) => o.id === customerId) || (ctx?.customer?.id === customerId ? ctx.customer : null);
  const noPhone = mode === "customer" && customerId && ctx && !ctx.phone;
  const query = mode === "customer" ? (customerId ? `customerId=${customerId}` : "") : phone ? `phone=${phone}` : "";

  return (
    <>
      <Modal
        title="Message a customer"
        open={open && step === "who"}
        onCancel={onClose}
        okText="Next: choose the message"
        okButtonProps={{ disabled: !phone }}
        onOk={() => setStep("template")}
        width={560}
      >
        <p className="text-sm text-ink-muted mt-0">New chats start with an approved template — WhatsApp&apos;s rule for messages a business starts.</p>
        <Segmented
          block
          value={mode}
          onChange={(m) => {
            setMode(m);
            setCtx(null);
          }}
          options={[
            { value: "customer", label: "A customer" },
            { value: "number", label: "A new number" },
          ]}
          className="mb-3"
        />
        {mode === "customer" ? (
          <div className="flex flex-col gap-2">
            <Select
              showSearch
              autoFocus
              placeholder="Search by name, phone or email"
              filterOption={false}
              onSearch={search}
              loading={searching}
              value={customerId}
              onChange={setCustomerId}
              notFoundContent={searching ? <Spin size="small" /> : "No customer found — use “A new number”."}
              options={[
                ...(picked && !options.some((o) => o.id === picked.id) ? [picked] : []),
                ...options,
              ].map((c) => ({
                value: c.id,
                label: (
                  <span className="flex justify-between gap-2">
                    <span className="truncate">{c.name || c.email || c.phone}</span>
                    <span className="text-ink-muted text-xs shrink-0">{c.phone || "no phone"}</span>
                  </span>
                ),
              }))}
            />
            {noPhone && <Alert type="warning" showIcon message="This customer has no valid mobile number" description="Add one on their customer page, or choose “A new number”." />}
            {ctx?.phone && (
              <p className="text-xs text-ink-muted m-0">
                Sends to <b>+{ctx.phone}</b>
                {ctx.orders.length ? ` · ${ctx.orders.length} order${ctx.orders.length === 1 ? "" : "s"} — you'll pick which one next` : " · no orders yet"}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <Select value={cc} onChange={setCc} options={COUNTRIES.map(([value, label]) => ({ value, label }))} className="!w-[150px] shrink-0" />
              <Input
                autoFocus
                inputMode="tel"
                placeholder={cc === "91" ? "98765 43210" : "Mobile number"}
                value={num}
                status={touched && typed?.error ? "error" : undefined}
                onChange={(e) => setNum(e.target.value)}
                onBlur={() => setTouched(true)}
              />
            </div>
            {typed?.error && (touched || String(num).replace(/\D/g, "").length >= 10) ? (
              <p className="text-xs text-status-danger m-0">{typed.error}</p>
            ) : typed?.e164 ? (
              <p className="text-xs text-ink-muted m-0">Sends to +{typed.e164}{ctx?.customer ? ` — that's ${ctx.customer.name}` : ""}</p>
            ) : null}
          </div>
        )}
        {ctx?.conversationId && (
          <Alert
            className="mt-3"
            type="info"
            showIcon
            message="You already have a chat with this number"
            action={
              <Button size="small" onClick={() => onStarted(ctx.conversationId)}>
                Open it
              </Button>
            }
          />
        )}
      </Modal>
      <TemplateComposer
        open={open && step === "template"}
        title={`Message ${picked?.name || (phone ? `+${phone}` : "")}`}
        onClose={onClose}
        templates={templates}
        query={query}
        onSend={async (body) => {
          try {
            const out = await apiFetch("/api/whatsapp/conversations", { method: "POST", body: { ...body, phone: `+${phone}`, ...(mode === "customer" && customerId && { customerId }) } });
            message.success("Sent");
            onStarted(out.conversation?.id || out.message?.conversationId);
          } catch (err) {
            message.error(err.message);
          }
        }}
      />
    </>
  );
}

function CustomerPanel({ data, team, onUpdate, onNote }) {
  const { conversation: c, profile } = data;
  const [note, setNote] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="font-semibold m-0">{displayName(c)}</p>
        <p className="text-ink-muted m-0">+{c.phone}</p>
        {c.customer ? (
          <Link href={`/admin/customers/${c.customer.id}`} className="text-xs">
            Open customer
          </Link>
        ) : (
          <p className="text-xs text-ink-muted m-0">Not linked to a customer in your store.</p>
        )}
      </div>
      {profile && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-app-bg p-2">
            <p className="text-xs text-ink-muted m-0">Orders</p>
            <p className="font-semibold m-0">{profile.ordersCount}</p>
          </div>
          <div className="rounded-md bg-app-bg p-2">
            <p className="text-xs text-ink-muted m-0">Spent</p>
            <p className="font-semibold m-0">{money(profile.totalSpent)}</p>
          </div>
        </div>
      )}
      {profile?.openCheckout && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
          <p className="text-xs font-semibold m-0">Left a checkout {relTime(profile.openCheckout.startedAt)} ago</p>
          <ul className="m-0 mt-1 pl-4 text-xs">
            {profile.openCheckout.items.map((i, k) => (
              <li key={k}>
                {i.quantity} × {i.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      {profile?.orders?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide m-0 mb-1">Recent orders</p>
          <ul className="list-none p-0 m-0 flex flex-col gap-1">
            {profile.orders.map((o) => (
              <li key={o.id} className="flex justify-between gap-2">
                <Link href={`/admin/orders/${o.id}`}>#{o.orderNumber}</Link>
                <span className="text-ink-muted text-xs">
                  {money(o.total)} · {o.cancelledAt ? "cancelled" : o.fulfillmentStatus}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide m-0 mb-1">Assigned to</p>
        <Select
          className="w-full"
          size="small"
          value={c.assignedToId || ""}
          onChange={(v) => onUpdate({ assignedToId: v || null })}
          options={[{ value: "", label: "Nobody" }, ...team.map((m) => ({ value: m.id, label: m.name }))]}
        />
      </div>
      <div>
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide m-0 mb-1">Answered by</p>
        <Segmented
          size="small"
          value={c.handledBy}
          onChange={(v) => onUpdate({ handledBy: v })}
          options={[
            { value: "human", label: "Team" },
            { value: "ai", label: "AI assistant" },
          ]}
        />
      </div>
      <div>
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide m-0 mb-1">Labels</p>
        <div className="flex flex-wrap gap-1 mb-1">
          {c.labels.map((l) => (
            <Tag key={l} closable onClose={() => onUpdate({ labels: c.labels.filter((x) => x !== l) })}>
              {l}
            </Tag>
          ))}
        </div>
        <Input
          size="small"
          placeholder="Add a label and press Enter"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onPressEnter={() => {
            if (labelDraft.trim()) onUpdate({ labels: [...c.labels, labelDraft.trim()] });
            setLabelDraft("");
          }}
        />
      </div>
      {c.optedOut && <Alert type="warning" showIcon message="Opted out of WhatsApp marketing" />}
      <div>
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide m-0 mb-1 flex items-center gap-1">
          <StickyNote size={12} aria-hidden="true" /> Internal notes
        </p>
        <ul className="list-none p-0 m-0 flex flex-col gap-2 mb-2">
          {c.notes.map((n) => (
            <li key={n.id} className="rounded-md bg-yellow-50 border border-yellow-100 p-2 text-xs whitespace-pre-wrap">
              {n.body}
              <span className="block text-ink-muted mt-1">
                {n.authorName || "Someone"} · {relTime(n.createdAt)}
              </span>
            </li>
          ))}
        </ul>
        <Input.TextArea size="small" rows={2} placeholder="Only your team sees notes" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button
          size="small"
          className="mt-1"
          disabled={!note.trim()}
          onClick={async () => {
            await onNote(note);
            setNote("");
          }}
        >
          Add note
        </Button>
      </div>
    </div>
  );
}

function Bubble({ m }) {
  const out = m.direction === "outbound";
  const media = m.mediaId && ["image", "video", "audio", "document", "sticker"].includes(m.messageType);
  const src = `${API_URL}/api/whatsapp/messages/${m.id}/media`;
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[78%] rounded-lg px-2.5 py-1.5 shadow-sm text-[13.5px] ${out ? "bg-[#d9fdd3]" : "bg-white"} ${m.status === "failed" ? "ring-1 ring-red-300" : ""}`}>
        {m.source === "ai" && <p className="text-[10.5px] text-violet-600 font-semibold m-0">AI assistant</p>}
        {m.messageType === "template" && <p className="text-[10.5px] text-ink-muted m-0 flex items-center gap-1"><FileText size={10} aria-hidden="true" /> {m.templateName}</p>}
        {media && m.messageType === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="rounded max-h-64 mb-1" loading="lazy" />
        )}
        {media && m.messageType !== "image" && (
          <a href={src} target="_blank" rel="noreferrer" className="block text-xs underline mb-1">
            Open {m.messageType}
          </a>
        )}
        <p className="m-0 whitespace-pre-wrap break-words">{m.body}</p>
        <p className="m-0 flex items-center justify-end gap-1 text-[10.5px] text-ink-muted">
          {m.sentByName && out && m.source !== "ai" ? <span>{m.sentByName} ·</span> : null}
          {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          {out && <Ticks status={m.status} error={m.error} />}
        </p>
        {m.status === "failed" && m.error && <p className="m-0 text-[11px] text-status-danger">{m.error}</p>}
      </div>
    </div>
  );
}

export default function Inbox() {
  const { message } = App.useApp();
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [thread, setThread] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [tplOpen, setTplOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newPreset, setNewPreset] = useState(null);
  const [team, setTeam] = useState([]);
  const [suggesting, setSuggesting] = useState(false);
  const [aiNote, setAiNote] = useState(null);
  const bottom = useRef(null);

  const loadList = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/whatsapp/conversations?${filterQuery(filter)}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      setList(data.conversations);
    } catch (err) {
      setList([]);
      message.error(err.message);
    }
  }, [filter, q, message]);

  const loadThread = useCallback(
    async (id, { scroll } = {}) => {
      if (!id) return;
      try {
        const data = await apiFetch(`/api/whatsapp/conversations/${id}`);
        setThread(data);
        if (scroll) setTimeout(() => bottom.current?.scrollIntoView({ block: "end" }), 50);
      } catch (err) {
        message.error(err.message);
      }
    },
    [message]
  );

  useEffect(() => {
    const t = setTimeout(loadList, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadList, q]);
  useEffect(() => {
    apiFetch("/api/whatsapp/templates?status=approved").then((d) => setTemplates(d.templates)).catch(() => {});
    apiFetch("/api/whatsapp/settings").then((d) => setTeam(d.team)).catch(() => {});
  }, []);
  // From a customer's page (WhatsApp button): their chat, or a new one with them.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const customerId = p.get("customer");
    const phone = p.get("to");
    if (!customerId && !phone) return;
    apiFetch(`/api/whatsapp/compose?${customerId ? `customerId=${encodeURIComponent(customerId)}` : `phone=${encodeURIComponent(phone)}`}`)
      .then((d) => {
        if (d.conversationId) open(d.conversationId);
        else {
          setNewPreset(customerId ? { customerId } : { phone });
          setNewOpen(true);
        }
      })
      .catch(() => {
        setNewPreset(customerId ? { customerId } : { phone });
        setNewOpen(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // New messages arrive by webhook — poll while the screen is open.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      loadList();
      if (activeId) loadThread(activeId);
    }, 10000);
    return () => clearInterval(t);
  }, [loadList, loadThread, activeId]);

  async function open(id) {
    setActiveId(id);
    setThread(null);
    setText("");
    setAiNote(null);
    await loadThread(id, { scroll: true });
    apiFetch(`/api/whatsapp/conversations/${id}/read`, { method: "POST" }).then(loadList).catch(() => {});
  }

  async function send(body) {
    setSending(true);
    try {
      await apiFetch(`/api/whatsapp/conversations/${activeId}/messages`, { method: "POST", body });
      setText("");
      setAiNote(null);
      await loadThread(activeId, { scroll: true });
      loadList();
      return true;
    } catch (err) {
      message.error(err.message);
      if (err.details?.reason === "window_closed") setTplOpen(true);
      return false;
    } finally {
      setSending(false);
    }
  }

  async function update(patch) {
    try {
      await apiFetch(`/api/whatsapp/conversations/${activeId}`, { method: "PATCH", body: patch });
      await loadThread(activeId);
      loadList();
    } catch (err) {
      message.error(err.message);
    }
  }

  async function suggest() {
    setSuggesting(true);
    try {
      const s = await apiFetch(`/api/whatsapp/conversations/${activeId}/suggest`, { method: "POST" });
      setText(s.reply);
      setAiNote(s.handoff ? `The AI suggests a person handles this${s.reason ? `: ${s.reason}` : "."}` : "Draft from the AI — check it before sending.");
    } catch (err) {
      message.error(err.message);
    } finally {
      setSuggesting(false);
    }
  }

  async function upload({ file }) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/conversations/${activeId}/media`, { method: "POST", credentials: "include", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      await send({ kind: "media", mediaId: data.mediaId, mediaType: data.mediaType, filename: data.filename, caption: text || undefined });
    } catch (err) {
      message.error(err.message);
    }
  }

  const c = thread?.conversation;
  const windowLeft = useMemo(() => (c?.windowEndsAt ? Math.max(0, new Date(c.windowEndsAt).getTime() - Date.now()) : 0), [c]);

  return (
    <div className="rounded-lg border border-app-border bg-app-surface overflow-hidden grid md:grid-cols-[300px_1fr] xl:grid-cols-[300px_1fr_280px]" style={{ height: "calc(100vh - 230px)", minHeight: 520 }}>
      {/* Conversations */}
      <div className={`border-r border-app-border flex flex-col min-h-0 ${activeId ? "hidden md:flex" : "flex"}`}>
        <div className="p-2 flex flex-col gap-2 border-b border-app-border">
          <div className="flex gap-2">
            <Input allowClear prefix={<Search size={14} aria-hidden="true" />} placeholder="Search name, number, message" value={q} onChange={(e) => setQ(e.target.value)} />
            <Tooltip title="Message a customer">
              <Button icon={<MessageSquarePlus size={15} aria-hidden="true" />} onClick={() => setNewOpen(true)} aria-label="Message a customer" />
            </Tooltip>
          </div>
          <Segmented size="small" block value={filter} onChange={setFilter} options={FILTERS} />
        </div>
        <div className="overflow-y-auto flex-1">
          {list === null ? (
            <div className="p-6 text-center">
              <Spin />
            </div>
          ) : list.length === 0 ? (
            <Empty className="mt-10" image={Empty.PRESENTED_IMAGE_SIMPLE} description={q ? "No conversations match" : "No conversations yet. When customers message your WhatsApp number, they appear here."} />
          ) : (
            list.map((cv) => (
              <button
                key={cv.id}
                type="button"
                onClick={() => open(cv.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-app-border flex gap-2 items-start hover:bg-app-bg ${cv.id === activeId ? "bg-accent-soft" : ""}`}
              >
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 grid place-items-center text-sm font-semibold shrink-0">{displayName(cv).replace(/^\+/, "").slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <span className={`truncate text-sm ${cv.unread ? "font-semibold" : ""}`}>{displayName(cv)}</span>
                    <span className="text-[11px] text-ink-muted shrink-0">{relTime(cv.lastMessageAt)}</span>
                  </div>
                  <div className="flex justify-between gap-2 items-center">
                    <span className="truncate text-xs text-ink-muted">{cv.lastPreview}</span>
                    {cv.unread > 0 && <Badge count={cv.unread} color="#16A34A" size="small" />}
                  </div>
                  <div className="flex gap-1 mt-0.5 flex-wrap">
                    {cv.handledBy === "ai" && <Tag color="purple" className="!text-[10px] !leading-4 !m-0">AI</Tag>}
                    {cv.viaPlatform && <Tag color="cyan" className="!text-[10px] !leading-4 !m-0">Oyklane number</Tag>}
                    {cv.assignedToName && <Tag className="!text-[10px] !leading-4 !m-0">{cv.assignedToName}</Tag>}
                    {cv.labels.slice(0, 2).map((l) => (
                      <Tag key={l} className="!text-[10px] !leading-4 !m-0" color={l === "Needs a person" ? "orange" : undefined}>
                        {l}
                      </Tag>
                    ))}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Thread */}
      <div className={`flex flex-col min-h-0 ${activeId ? "flex" : "hidden md:flex"}`}>
        {!activeId ? (
          <div className="flex-1 grid place-items-center text-sm text-ink-muted p-6 text-center">Choose a conversation to read and reply.</div>
        ) : !thread ? (
          <div className="flex-1 grid place-items-center">
            <Spin />
          </div>
        ) : (
          <>
            <div className="px-3 py-2 border-b border-app-border flex items-center gap-2">
              <Button type="text" className="md:!hidden" icon={<ArrowLeft size={16} aria-hidden="true" />} onClick={() => setActiveId(null)} aria-label="Back to conversations" />
              <div className="min-w-0 flex-1">
                <p className="m-0 font-semibold truncate">
                  {displayName(c)}
                  {c.viaPlatform && (
                    <Tooltip title="This customer is chatting with Oyklane's shared number (it sent your order updates). Your replies go from that number too.">
                      <Tag color="cyan" className="!ml-2 !text-[10px]">via Oyklane&apos;s number</Tag>
                    </Tooltip>
                  )}
                </p>
                <p className="m-0 text-xs text-ink-muted flex items-center gap-1">
                  {c.windowOpen ? (
                    <>
                      <Clock size={11} aria-hidden="true" /> Reply window open · {Math.floor(windowLeft / 3600000)}h {Math.floor((windowLeft % 3600000) / 60000)}m left
                    </>
                  ) : (
                    <>
                      <Lock size={11} aria-hidden="true" /> Window closed — templates only
                    </>
                  )}
                </p>
              </div>
              <Button size="small" onClick={() => update({ status: c.status === "open" ? "closed" : "open" })}>
                {c.status === "open" ? "Close" : "Reopen"}
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5" style={{ background: "#efeae2" }}>
              {thread.messages.map((m) => (
                <Bubble key={m.id} m={m} />
              ))}
              <div ref={bottom} />
            </div>
            <div className="border-t border-app-border p-2 flex flex-col gap-1.5">
              {aiNote && <p className="text-xs text-violet-700 m-0">{aiNote}</p>}
              {c.windowOpen ? (
                <div className="flex gap-2 items-end">
                  <Upload showUploadList={false} customRequest={upload} accept="image/jpeg,image/png,video/mp4,application/pdf,audio/*">
                    <Button icon={<Paperclip size={15} aria-hidden="true" />} aria-label="Attach a file" />
                  </Upload>
                  <Input.TextArea
                    autoSize={{ minRows: 1, maxRows: 6 }}
                    value={text}
                    maxLength={4096}
                    placeholder="Reply… (Enter to send, Shift+Enter for a new line)"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (text.trim()) send({ kind: "text", body: text });
                      }
                    }}
                  />
                  <Tooltip title="Draft a reply with AI">
                    <Button icon={<Sparkles size={15} aria-hidden="true" />} loading={suggesting} onClick={suggest} aria-label="Draft a reply with AI" />
                  </Tooltip>
                  <Button type="primary" icon={<Send size={15} aria-hidden="true" />} loading={sending} disabled={!text.trim()} onClick={() => send({ kind: "text", body: text })} aria-label="Send" />
                </div>
              ) : (
                <p className="text-xs text-ink-muted m-0">
                  More than 24 hours since {displayName(c)}&apos;s last message — WhatsApp only allows approved templates until they reply.
                </p>
              )}
              <div className="flex gap-2">
                <Button size="small" icon={<FileText size={13} aria-hidden="true" />} onClick={() => setTplOpen(true)}>
                  Send a template
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Customer */}
      <div className="hidden xl:block border-l border-app-border overflow-y-auto p-3">
        {thread ? (
          <CustomerPanel
            data={thread}
            team={team}
            onUpdate={update}
            onNote={async (body) => {
              await apiFetch(`/api/whatsapp/conversations/${activeId}/notes`, { method: "POST", body: { body } });
              loadThread(activeId);
            }}
          />
        ) : (
          <div className="text-sm text-ink-muted flex items-center gap-2">
            <UserRound size={14} aria-hidden="true" /> Customer details show here.
          </div>
        )}
      </div>

      <TemplateComposer
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        templates={templates}
        query={c ? (c.customerId ? `customerId=${c.customerId}` : `phone=${c.phone}`) : ""}
        onSend={async (body) => {
          if (await send({ kind: "template", ...body })) setTplOpen(false);
        }}
      />
      <NewConversation
        open={newOpen}
        preset={newPreset}
        onClose={() => {
          setNewOpen(false);
          setNewPreset(null);
        }}
        templates={templates}
        onStarted={(id) => {
          setNewOpen(false);
          setNewPreset(null);
          loadList();
          if (id) open(id);
        }}
      />
    </div>
  );
}
