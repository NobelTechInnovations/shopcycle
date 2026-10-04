"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Input, Skeleton } from "antd";
import { Search, Sparkles, Ticket, ChevronRight, BookOpen, Rocket, Package, ShoppingCart, CreditCard, Truck, Palette, Globe, Puzzle, Megaphone, Receipt, Users } from "lucide-react";
import { PageHeader, StatusBadge } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { TICKET_STATUS } from "@/lib/support";
import { useHelp } from "@/components/help/HelpDrawer";

const TOPIC_ICON = {
  "getting-started": Rocket,
  products: Package,
  orders: ShoppingCart,
  payments: CreditCard,
  shipping: Truck,
  design: Palette,
  domains: Globe,
  apps: Puzzle,
  marketing: Megaphone,
  billing: Receipt,
  account: Users,
};

const when = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function HelpCentrePage({ searchParams }) {
  const params = use(searchParams);
  const { openHelp } = useHelp();
  const [all, setAll] = useState(null);
  const [categories, setCategories] = useState([]);
  const [tickets, setTickets] = useState(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);

  useEffect(() => {
    apiFetch("/api/support/articles").then((d) => {
      setAll(d.articles);
      setCategories(d.categories);
    });
    apiFetch("/api/support/tickets").then((d) => setTickets(d.tickets)).catch(() => setTickets([]));
  }, []);

  // Linked from elsewhere with ?new=feature (e.g. "Missing an app? Tell us").
  useEffect(() => {
    if (params?.new) openHelp({ ticket: { category: params.new, subject: params.new === "feature" ? "Feature request: " : "" } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.new]);

  useEffect(() => {
    const words = q.trim();
    if (words.length < 2) {
      setResults(null);
      return undefined;
    }
    const t = setTimeout(() => {
      apiFetch(`/api/support/articles?q=${encodeURIComponent(words)}`).then((d) => setResults(d.articles));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const byTopic = useMemo(() => {
    const groups = {};
    for (const a of all || []) (groups[a.category] ||= []).push(a);
    return categories.filter((c) => groups[c.key]).map((c) => ({ ...c, articles: groups[c.key] }));
  }, [all, categories]);

  const openTickets = (tickets || []).filter((t) => ["open", "waiting"].includes(t.status));

  return (
    <div>
      <PageHeader
        title="Help centre"
        subtitle="Guides for every part of your store — and the Oyklane team when you need a person."
        actions={
          <>
            <Button icon={<Ticket size={14} aria-hidden="true" />} onClick={() => openHelp({ ticket: {} })}>
              Contact the team
            </Button>
            <Button type="primary" icon={<Sparkles size={14} aria-hidden="true" />} onClick={() => openHelp()}>
              Ask the assistant
            </Button>
          </>
        }
      />

      <section className="relative overflow-hidden rounded-[18px] px-5 sm:px-8 py-8 mb-6 border border-app-border" style={{ background: "linear-gradient(135deg, #F4F0FF 0%, #EEF8F6 100%)" }}>
        <h2 className="text-[20px] sm:text-[24px] font-semibold text-ink m-0" style={{ letterSpacing: "-0.02em" }}>
          What do you need help with?
        </h2>
        <p className="text-[14px] text-ink-muted mt-1 mb-4">Search the guides, or ask the assistant in your own words.</p>
        <div className="flex flex-col sm:flex-row gap-2 max-w-2xl">
          <Input
            size="large"
            allowClear
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onPressEnter={() => q.trim() && (!results || !results.length) && openHelp({ question: q.trim() })}
            prefix={<Search size={17} className="text-ink-subtle" aria-hidden="true" />}
            placeholder="e.g. connect my domain, add sizes, COD"
            aria-label="Search the help centre"
          />
          <Button size="large" type="primary" disabled={!q.trim()} onClick={() => openHelp({ question: q.trim() })} icon={<Sparkles size={15} aria-hidden="true" />}>
            Ask
          </Button>
        </div>
        {results && (
          <div className="mt-3 max-w-2xl bg-app-surface border border-app-border rounded-[12px] shadow-raised overflow-hidden">
            {results.length ? (
              results.slice(0, 6).map((a) => (
                <Link key={a.slug} href={`/admin/support/articles/${a.slug}`} className="flex items-start gap-3 px-4 py-3 no-underline border-b border-app-border last:border-0 hover:bg-app-bg">
                  <BookOpen size={15} className="text-ink-subtle mt-0.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-[14px] text-ink font-medium">{a.title}</span>
                    {a.excerpt && <span className="block text-[12.5px] text-ink-muted truncate">{a.excerpt}</span>}
                  </span>
                </Link>
              ))
            ) : (
              <div className="px-4 py-3 text-[13px] text-ink-muted flex flex-wrap items-center justify-between gap-2">
                No guide matches that.
                <Button size="small" type="primary" ghost onClick={() => openHelp({ question: q.trim() })}>
                  Ask the assistant instead
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <section>
          <h2 className="text-[15px] font-semibold text-ink mb-3">Browse by topic</h2>
          {!all ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {byTopic.map((topic) => {
                const Icon = TOPIC_ICON[topic.key] || BookOpen;
                return (
                  <article key={topic.key} className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-4">
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span className="w-8 h-8 rounded-[9px] bg-accent-soft text-accent flex items-center justify-center" aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <h3 className="m-0 text-[14px] font-semibold text-ink">{topic.label}</h3>
                      <span className="ml-auto text-[12px] text-ink-subtle">{topic.articles.length}</span>
                    </div>
                    <ul className="list-none m-0 p-0 flex flex-col">
                      {topic.articles.map((a) => (
                        <li key={a.slug}>
                          <Link href={`/admin/support/articles/${a.slug}`} className="group flex items-center justify-between gap-2 py-1.5 text-[13.5px] text-ink-muted no-underline hover:text-ink">
                            <span className="truncate">{a.title}</span>
                            <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 shrink-0" aria-hidden="true" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside id="tickets" className="lg:sticky lg:top-20 flex flex-col gap-4">
          <section className="bg-app-surface border border-app-border rounded-[14px] shadow-card p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="m-0 text-[15px] font-semibold text-ink">Your tickets</h2>
              {openTickets.length > 0 && <span className="text-[12px] text-ink-muted">{openTickets.length} open</span>}
            </div>
            {!tickets ? (
              <Skeleton active paragraph={{ rows: 3 }} title={false} />
            ) : tickets.length ? (
              <ul className="list-none m-0 p-0 -mx-1">
                {tickets.slice(0, 8).map((t) => {
                  const s = TICKET_STATUS[t.status] || TICKET_STATUS.open;
                  return (
                    <li key={t.id}>
                      <Link href={`/admin/support/tickets/${t.id}`} className="block rounded-[10px] px-2 py-2 no-underline hover:bg-app-bg">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-[13.5px] text-ink font-medium truncate">{t.subject}</span>
                          <span className="text-[11.5px] text-ink-subtle shrink-0">{when(t.lastMessageAt)}</span>
                        </span>
                        <span className="flex items-center gap-2 mt-1">
                          <span className="text-[12px] text-ink-subtle">{t.ref}</span>
                          <StatusBadge status={t.status} label={s.label} tone={s.tone} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-muted m-0">No tickets yet. When you contact the team, the conversation shows up here.</p>
            )}
          </section>
          <section className="rounded-[14px] p-4 text-white" style={{ background: "linear-gradient(145deg, #1D1B2E 0%, #3B2B8F 100%)" }}>
            <Sparkles size={18} aria-hidden="true" />
            <p className="text-[14px] font-semibold mt-2 mb-1">Answers in seconds</p>
            <p className="text-[12.5px] text-white/75 mt-0 mb-3 leading-relaxed">The assistant knows these guides and your store's setup. Press <kbd className="px-1 rounded bg-white/15 text-[11px]">?</kbd> anywhere to open it.</p>
            <Button size="small" className="!bg-white !text-ink !border-white" onClick={() => openHelp()}>
              Ask a question
            </Button>
          </section>
        </aside>
      </div>
    </div>
  );
}
