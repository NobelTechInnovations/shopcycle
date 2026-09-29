"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { App, Button, Drawer, Form, Input, Select } from "antd";
import { ArrowUp, BookOpen, CheckCircle2, LifeBuoy, MessageSquarePlus, Sparkles, Square, ThumbsUp, Ticket, X } from "lucide-react";
import { useHasMounted, Markdown } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { streamAsk } from "@/lib/support";

/**
 * Help, from anywhere in the admin: ask the assistant, and if it can't
 * sort it out, hand the conversation to the Oyklane team as a ticket.
 * The conversation lives here (the admin shell), so it survives moving
 * between pages while the drawer is closed.
 */

const HelpContext = createContext({ openHelp: () => {} });
export const useHelp = () => useContext(HelpContext);

function Avatar() {
  return (
    <span className="w-7 h-7 rounded-full bg-brand-gradient text-white flex items-center justify-center shrink-0 shadow-card" aria-hidden="true">
      <Sparkles size={14} />
    </span>
  );
}

function Typing() {
  return (
    <span className="inline-flex gap-1 py-2" aria-label="Writing an answer">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-ink-subtle animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  );
}

function TicketForm({ config, chatId, messages, onDone, onCancel, preset }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const questions = messages.filter((m) => m.role === "user").map((m) => m.content);
  const initial = {
    subject: preset?.subject || (questions[0] || "").slice(0, 90),
    category: preset?.category && config.categories.some((c) => c.key === preset.category) ? preset.category : config.categories[0]?.key,
    priority: "normal",
    body: preset?.body || questions[questions.length - 1] || "",
  };
  async function submit(values) {
    setSending(true);
    try {
      const { ticket } = await apiFetch("/api/support/tickets", { method: "POST", body: { ...values, chatId } });
      onDone(ticket);
    } catch (err) {
      message.error(err.message);
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="rounded-[14px] border border-app-border bg-app-surface p-4 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <Ticket size={16} className="text-accent" aria-hidden="true" />
        <p className="m-0 text-[14px] font-semibold text-ink">Ask the Oyklane team</p>
      </div>
      <p className="text-[12.5px] text-ink-muted mt-0 mb-3">
        {chatId ? "Your conversation above is attached. " : ""}We'll reply {config.replyPromise} by email and in Help ▸ Your tickets.
      </p>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={initial} onFinish={submit} className="[&_.ant-form-item]:mb-3">
        <Form.Item name="subject" label="Subject" rules={[{ required: true, min: 3, message: "Add a short subject" }]}>
          <Input maxLength={160} />
        </Form.Item>
        <div className="grid grid-cols-2 gap-2">
          <Form.Item name="category" label="Topic">
            <Select options={config.categories.map((c) => ({ value: c.key, label: c.label }))} />
          </Form.Item>
          <Form.Item name="priority" label="How urgent">
            <Select
              options={[
                { value: "low", label: "Not urgent" },
                { value: "normal", label: "Normal" },
                { value: "high", label: "It's hurting sales" },
                { value: "urgent", label: "Store is down" },
              ]}
            />
          </Form.Item>
        </div>
        <Form.Item name="body" label="What's happening?" rules={[{ required: true, min: 5, message: "Tell us a little more" }]} extra="Order numbers, what you clicked, and what you expected help us answer faster.">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={8000} />
        </Form.Item>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={sending}>
            Send to the team
          </Button>
        </div>
      </Form>
    </div>
  );
}

function HelpPanel({ user, open, onClose, request, clearRequest }) {
  const { message } = App.useApp();
  const [config, setConfig] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatId, setChatId] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState(null); // null | "solved" | "ticket"
  const [ticket, setTicket] = useState(null);
  const [preset, setPreset] = useState(null);
  const abortRef = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && !config) apiFetch("/api/support/config").then(setConfig).catch(() => setConfig({ ai: false, suggestions: [], categories: [{ key: "general", label: "General question" }], replyPromise: "soon" }));
  }, [open, config]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, feedback, ticket]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setChatId(null);
    setFeedback(null);
    setTicket(null);
    setPreset(null);
    setInput("");
    setStreaming(false);
  }, []);

  const ask = useCallback(
    async (text) => {
      const question = String(text || "").trim();
      if (!question || streaming) return;
      setInput("");
      setFeedback(null);
      setTicket(null);
      setMessages((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "", articles: [], streaming: true }]);
      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;
      const patchLast = (fn) => setMessages((m) => m.map((x, i) => (i === m.length - 1 ? fn(x) : x)));
      try {
        await streamAsk({ question, chatId, signal: controller.signal }, (e) => {
          if (e.type === "start") {
            setChatId(e.chatId);
            patchLast((x) => ({ ...x, articles: e.articles || [] }));
          } else if (e.type === "delta") patchLast((x) => ({ ...x, content: x.content + e.text }));
          else if (e.type === "error") patchLast((x) => ({ ...x, content: x.content || e.message, error: true }));
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          patchLast((x) => ({ ...x, content: x.content || err.message, error: true }));
        }
      } finally {
        patchLast((x) => ({ ...x, streaming: false }));
        setStreaming(false);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    [chatId, streaming]
  );

  // openHelp({ question }) asks straight away; openHelp({ ticket }) opens the form.
  useEffect(() => {
    if (!open || !request || !config) return;
    if (request.ticket) {
      setPreset(request.ticket);
      setFeedback("ticket");
    } else if (request.question) {
      ask(request.question);
    }
    clearRequest();
  }, [open, request, config, ask, clearRequest]);

  async function markSolved() {
    setFeedback("solved");
    if (chatId) apiFetch(`/api/support/chats/${chatId}/feedback`, { method: "POST", body: { resolved: true } }).catch(() => {});
  }

  const firstName = String(user?.name || "").split(" ")[0];
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-5 h-14 border-b border-app-border shrink-0">
        <span className="w-8 h-8 rounded-[10px] bg-accent-soft text-accent flex items-center justify-center" aria-hidden="true">
          <LifeBuoy size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[15px] font-semibold text-ink leading-tight">Help</h2>
          <p className="m-0 text-[12px] text-ink-muted leading-tight">{config?.ai ? "Answers in seconds · the team is a click away" : "Help centre and the Oyklane team"}</p>
        </div>
        {messages.length > 0 && (
          <Button size="small" type="text" icon={<MessageSquarePlus size={14} aria-hidden="true" />} onClick={reset}>
            New
          </Button>
        )}
        <button type="button" onClick={onClose} aria-label="Close help" className="w-8 h-8 rounded-md flex items-center justify-center bg-transparent border-0 cursor-pointer text-ink-muted hover:text-ink hover:bg-app-bg">
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5" aria-live="polite">
        {messages.length === 0 && feedback !== "ticket" && (
          <div>
            <div className="rounded-[16px] p-5 text-white mb-5" style={{ background: "radial-gradient(130% 150% at 0% 0%, #7C5CFF 0%, #5B3FE0 45%, #1D1B2E 100%)" }}>
              <Sparkles size={20} aria-hidden="true" />
              <p className="text-[17px] font-semibold mt-2 mb-1" style={{ letterSpacing: "-0.01em" }}>
                Hi{firstName ? ` ${firstName}` : ""}, how can we help?
              </p>
              <p className="text-[13px] text-white/80 m-0 leading-relaxed">Ask anything about running your store — payments, domains, orders, apps. If the answer doesn't sort it out, the Oyklane team will.</p>
            </div>
            {config?.suggestions?.length > 0 && (
              <>
                <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-subtle mb-2">Popular questions</p>
                <div className="flex flex-col gap-1.5 mb-5">
                  {config.suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => ask(s)} className="text-left text-[13.5px] text-ink bg-app-surface border border-app-border rounded-[10px] px-3 py-2.5 cursor-pointer hover:border-accent hover:bg-accent-soft/40 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Link href="/admin/support" onClick={onClose} className="flex items-center gap-2 rounded-[10px] border border-app-border px-3 py-2.5 text-[13px] text-ink no-underline hover:bg-app-bg">
                <BookOpen size={15} className="text-ink-muted" aria-hidden="true" /> Help centre
              </Link>
              <Link href="/admin/support#tickets" onClick={onClose} className="flex items-center gap-2 rounded-[10px] border border-app-border px-3 py-2.5 text-[13px] text-ink no-underline hover:bg-app-bg">
                <Ticket size={15} className="text-ink-muted" aria-hidden="true" /> Your tickets
              </Link>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="self-end max-w-[85%] rounded-[14px] rounded-br-[4px] bg-ink text-white px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap">
                {m.content}
              </div>
            ) : (
              <div key={i} className="flex gap-2.5 items-start">
                <Avatar />
                <div className="min-w-0 flex-1">
                  <div className={`rounded-[14px] rounded-tl-[4px] border px-3.5 py-2.5 ${m.error ? "bg-[#FDF3F3] border-[#F3D0D0]" : "bg-app-surface border-app-border"}`}>
                    {m.content ? <Markdown text={m.content} /> : <Typing />}
                  </div>
                  {!m.streaming && m.articles?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.articles.slice(0, 3).map((a) => (
                        <Link key={a.slug} href={`/admin/support/articles/${a.slug}`} onClick={onClose} className="inline-flex items-center gap-1 text-[12px] text-ink-muted bg-app-bg border border-app-border rounded-full px-2.5 py-1 no-underline hover:text-ink">
                          <BookOpen size={11} aria-hidden="true" /> {a.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          )}

          {lastAssistant && !lastAssistant.streaming && !feedback && !ticket && (
            <div className="flex flex-wrap items-center gap-2 pl-9">
              <span className="text-[12.5px] text-ink-muted mr-1">Did this solve it?</span>
              <Button size="small" icon={<ThumbsUp size={13} aria-hidden="true" />} onClick={markSolved}>
                Yes, thanks
              </Button>
              <Button size="small" type="primary" ghost onClick={() => setFeedback("ticket")}>
                I still need help
              </Button>
            </div>
          )}
          {feedback === "solved" && <p className="pl-9 m-0 text-[12.5px] text-status-success inline-flex items-center gap-1.5"><CheckCircle2 size={14} aria-hidden="true" /> Great — glad that sorted it. Ask anything else below.</p>}
          {feedback === "ticket" && !ticket && config && (
            <TicketForm config={config} chatId={chatId} messages={messages} preset={preset} onCancel={() => setFeedback(null)} onDone={(t) => (setTicket(t), message.success(`Ticket ${t.ref} sent`))} />
          )}
          {ticket && (
            <div className="rounded-[14px] border border-[#CDEBD8] bg-[#F1FAF4] p-4">
              <p className="m-0 text-[14px] font-semibold text-ink inline-flex items-center gap-2">
                <CheckCircle2 size={16} className="text-status-success" aria-hidden="true" /> Ticket {ticket.ref} is with the team
              </p>
              <p className="text-[13px] text-ink-muted mt-1.5 mb-3">We'll reply {config?.replyPromise || "soon"} to {ticket.email}. You can add details any time.</p>
              <Link href={`/admin/support/tickets/${ticket.id}`} onClick={onClose} className="text-[13px] font-medium text-ink">
                View ticket →
              </Link>
            </div>
          )}
        </div>
        <div ref={endRef} />
      </div>

      <div className="border-t border-app-border p-3 shrink-0 bg-app-surface">
        <div className="flex items-end gap-2 rounded-[14px] border border-app-border bg-app-bg/60 focus-within:border-accent focus-within:bg-app-surface transition-colors px-3 py-2">
          <Input.TextArea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder={messages.length ? "Ask a follow-up…" : "Ask a question…"}
            autoSize={{ minRows: 1, maxRows: 5 }}
            variant="borderless"
            className="!px-0 !py-1 !bg-transparent"
            maxLength={2000}
            aria-label="Your question"
            disabled={!config}
          />
          {streaming ? (
            <Button shape="circle" icon={<Square size={12} aria-hidden="true" />} onClick={() => abortRef.current?.abort()} aria-label="Stop answering" />
          ) : (
            <Button type="primary" shape="circle" icon={<ArrowUp size={15} aria-hidden="true" />} onClick={() => ask(input)} disabled={!input.trim()} aria-label="Send question" />
          )}
        </div>
        <p className="text-[11px] text-ink-subtle text-center mt-2 mb-0">
          {config?.ai ? "AI answers can be wrong — the team checks anything you send them." : "Answers come from the Oyklane help centre."}
          {!feedback && messages.length === 0 && (
            <>
              {" "}
              <button type="button" onClick={() => setFeedback("ticket")} className="bg-transparent border-0 p-0 text-[11px] text-ink-muted underline cursor-pointer">
                Contact the team
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export function HelpProvider({ user, children }) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState(null);
  const openHelp = useCallback((req = null) => {
    setRequest(req);
    setOpen(true);
  }, []);
  const clearRequest = useCallback(() => setRequest(null), []);

  // "?" anywhere (outside a text field) opens Help.
  useEffect(() => {
    function onKey(e) {
      const t = e.target;
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Client-only: the drawer's portal isn't in the server HTML. Once opened
  // it stays mounted, so the conversation survives closing it.
  const mounted = useHasMounted();
  return (
    <HelpContext.Provider value={{ openHelp }}>
      {children}
      {mounted && (
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          placement="right"
          width={440}
          closable={false}
          styles={{ body: { padding: 0 }, wrapper: { maxWidth: "100vw" } }}
          aria-label="Help"
        >
          <HelpPanel user={user} open={open} onClose={() => setOpen(false)} request={request} clearRequest={clearRequest} />
        </Drawer>
      )}
    </HelpContext.Provider>
  );
}
