"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer, Steps, Button, Form, Input, InputNumber, Select, Radio, DatePicker, Switch, Alert, Card, Tag, Space, App, Modal, Table, Spin, Segmented } from "antd";
import { Plus, Trash2, Sparkles, Lightbulb, Rocket, CheckCircle2, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { GImagePicker, SLOT } from "./GMedia";

const rid = () => Math.random().toString(36).slice(2, 9);
const STEPS = ["Type", "Budget & bidding", "Where & who", "Ads", "Review"];

function Help({ children }) {
  return <p className="text-xs text-ink-muted mt-1 mb-0">{children}</p>;
}

function blankAd(url) {
  return { key: rid(), finalUrl: url || "", headlines: ["", "", ""], descriptions: ["", ""], path1: "", path2: "", longHeadline: "", businessName: "", images: { landscape: [], square: [], logo: [] } };
}
function blankAdGroup(url, n = 1) {
  return { key: rid(), name: `Ad group ${n}`, cpc: null, keywords: [], ads: [blankAd(url)] };
}
function blankAssetGroup(url, storeName, n = 1) {
  return { key: rid(), name: `Asset group ${n}`, finalUrl: url || "", headlines: ["", "", ""], longHeadlines: [""], descriptions: ["", ""], businessName: (storeName || "").slice(0, 25), images: { landscape: [], square: [], portrait: [], logo: [] }, allProducts: true };
}
function blankSpec(caps, url, storeName) {
  return {
    campaign: { name: "", type: "SEARCH", budget: 500, bidding: caps?.purchaseTracking ? "MAXIMIZE_CONVERSIONS" : "MAXIMIZE_CLICKS", targetCpa: null, targetRoas: null, maxCpc: null, startDate: null, endDate: null, locations: [{ id: "2356", name: "India" }], excludedLocations: [], languages: [{ id: "1000", name: "English" }], searchPartners: false, negativeKeywords: [], merchantId: caps?.merchants?.[0] || null, urlExpansion: true },
    adGroups: [blankAdGroup(url)],
    assetGroups: [blankAssetGroup(url, storeName)],
  };
}

/** A list of short texts with per-item character limits. */
function TextList({ label, items, onChange, max, min = 1, limit, hint }) {
  return (
    <Form.Item label={`${label} (${items.filter((x) => x.trim()).length}/${max})`} className="!mb-2" extra={hint}>
      <div className="flex flex-col gap-1.5">
        {items.map((v, i) => (
          <div key={i} className="flex gap-1.5 items-center">
            <Input value={v} maxLength={limit + 20} status={v.length > limit ? "error" : undefined} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} suffix={<span className={`text-[11px] ${v.length > limit ? "text-status-danger" : "text-ink-subtle"}`}>{v.length}/{limit}</span>} />
            <Button size="small" type="text" disabled={items.length <= min} icon={<Trash2 size={13} aria-hidden="true" />} onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove" />
          </div>
        ))}
        {items.length < max && (
          <Button size="small" className="self-start" icon={<Plus size={13} aria-hidden="true" />} onClick={() => onChange([...items, ""])}>
            Add
          </Button>
        )}
      </div>
    </Form.Item>
  );
}

function ImageSlots({ value = {}, onChange, slots }) {
  const [open, setOpen] = useState(null);
  const [previews, setPreviews] = useState({});
  return (
    <div className="grid sm:grid-cols-2 gap-2">
      {slots.map((s) => (
        <div key={s} className="rounded-md border border-app-border p-2">
          <div className="flex justify-between items-center">
            <span className="text-sm">{SLOT[s].label}</span>
            <Button size="small" onClick={() => setOpen(s)}>{(value[s] || []).length ? `${value[s].length} chosen` : "Choose"}</Button>
          </div>
          <div className="flex gap-1 mt-1 flex-wrap">
            {(previews[s] || []).map((m) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={m.hash} src={m.previewUrl} alt="" className="w-10 h-10 object-cover rounded border border-app-border" />
            ))}
          </div>
        </div>
      ))}
      <GImagePicker
        open={Boolean(open)}
        slot={open}
        max={open === "logo" ? 5 : 20}
        selected={value[open] || []}
        onClose={() => setOpen(null)}
        onPick={(rns, items) => {
          onChange({ ...value, [open]: rns });
          setPreviews((p) => ({ ...p, [open]: items }));
          setOpen(null);
        }}
      />
    </div>
  );
}

function KeywordIdeas({ open, onClose, onAdd, url, locations, language }) {
  const { message } = App.useApp();
  const [seeds, setSeeds] = useState("");
  const [ideas, setIdeas] = useState(null);
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onCancel={onClose} title="Keyword ideas from Google" width={820} okText={`Add ${sel.length}`} okButtonProps={{ disabled: !sel.length }} onOk={() => onAdd(sel)}>
      <Space.Compact className="w-full mb-3">
        <Input placeholder="A few words about what you sell, e.g. kaju katli, diwali sweets" value={seeds} onChange={(e) => setSeeds(e.target.value)} />
        <Button
          type="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setIdeas((await apiFetch("/api/google-ads/keywords/ideas", { method: "POST", body: { seeds: seeds.split(",").map((x) => x.trim()).filter(Boolean), url: url || undefined, locations, language } })).ideas);
              setSel([]);
            } catch (err) {
              message.error(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Get ideas
        </Button>
      </Space.Compact>
      {ideas && (
        <Table
          size="small"
          rowKey="text"
          dataSource={ideas}
          pagination={{ pageSize: 15 }}
          rowSelection={{ selectedRowKeys: sel, onChange: setSel }}
          columns={[
            { title: "Keyword", dataIndex: "text" },
            { title: "Monthly searches", dataIndex: "searches", align: "right", render: (v) => (v != null ? Number(v).toLocaleString("en-IN") : "—"), sorter: (a, b) => (a.searches || 0) - (b.searches || 0) },
            { title: "Competition", dataIndex: "competition" },
            { title: "Top-of-page bid", align: "right", render: (_, r) => (r.lowBid != null ? `₹${r.lowBid.toFixed(0)}–${(r.highBid || 0).toFixed(0)}` : "—") },
          ]}
        />
      )}
      <Help>From Google&apos;s Keyword Planner for your locations and language. Pick closely related ones — one theme per ad group works best.</Help>
    </Modal>
  );
}

function AiCopy({ open, onClose, onUse, type }) {
  const { message } = App.useApp();
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState(null);
  const [angle, setAngle] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && !products.length) apiFetch("/api/products?pageSize=50").then((d) => setProducts(d.products || [])).catch(() => {});
  }, [open, products.length]);
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Write with AI"
      okText="Fill in"
      confirmLoading={busy}
      onOk={async () => {
        setBusy(true);
        try {
          onUse(await apiFetch("/api/google-ads/ai/copy", { method: "POST", body: { productId, angle, type } }));
        } catch (err) {
          message.error(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-col gap-2">
        <Select showSearch allowClear placeholder="About which product? (optional)" value={productId} onChange={setProductId} optionFilterProp="label" options={products.map((p) => ({ value: p.id, label: p.title }))} />
        <Input placeholder="Focus, e.g. festive gifting, free delivery" value={angle} onChange={(e) => setAngle(e.target.value)} />
        <Help>Follows Google&apos;s ad text rules and uses only your product&apos;s real details. Review before publishing.</Help>
      </div>
    </Modal>
  );
}

function SearchSelect({ value, onChange, placeholder }) {
  const [opts, setOpts] = useState([]);
  const [loading, setLoading] = useState(false);
  const t = useRef(null);
  return (
    <Select
      mode="multiple"
      labelInValue
      showSearch
      filterOption={false}
      placeholder={placeholder}
      notFoundContent={loading ? <Spin size="small" /> : "Type to search"}
      value={(value || []).map((v) => ({ value: v.id, label: v.name }))}
      onSearch={(q) => {
        clearTimeout(t.current);
        if (q.length < 2) return;
        t.current = setTimeout(async () => {
          setLoading(true);
          try {
            setOpts((await apiFetch(`/api/google-ads/targeting/locations?q=${encodeURIComponent(q)}`)).results);
          } catch {
            setOpts([]);
          } finally {
            setLoading(false);
          }
        }, 300);
      }}
      onChange={(sel) => onChange(sel.map((s) => ({ id: s.value, name: opts.find((o) => o.id === s.value)?.label || s.label })))}
      options={opts.map((o) => ({ value: o.id, label: `${o.label} · ${String(o.type || "").toLowerCase()}` }))}
      className="w-full"
    />
  );
}

export default function GWizard({ open, onClose, draftId: initialDraft, caps, storeUrl, storeName, onPublished }) {
  const { message, modal } = App.useApp();
  const [step, setStep] = useState(0);
  const [spec, setSpec] = useState(null);
  const [draftId, setDraftId] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const [active, setActive] = useState(0);
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [published, setPublished] = useState(null);
  const [languages, setLanguages] = useState([]);
  const [ideasFor, setIdeasFor] = useState(null);
  const [aiFor, setAiFor] = useState(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setCheck(null);
    setPublished(null);
    setActive(0);
    dirty.current = false;
    apiFetch("/api/google-ads/targeting/languages").then((d) => setLanguages(d.results)).catch(() => {});
    if (initialDraft) {
      apiFetch(`/api/google-ads/drafts/${initialDraft}`)
        .then(({ draft }) => {
          setSpec(draft.data);
          setDraftId(draft.id);
        })
        .catch((err) => message.error(err.message));
    } else {
      setSpec(blankSpec(caps, storeUrl, storeName));
      setDraftId(null);
    }
  }, [open, initialDraft, caps, storeUrl, storeName, message]);

  const set = useCallback((fn) => {
    dirty.current = true;
    setCheck(null);
    setSpec((s) => (typeof fn === "function" ? fn(s) : fn));
  }, []);
  const setC = (patch) => set((s) => ({ ...s, campaign: { ...s.campaign, ...patch } }));

  useEffect(() => {
    if (!open || !spec || !dirty.current) return;
    setSaveState("pending");
    const t = setTimeout(async () => {
      try {
        if (draftId) await apiFetch(`/api/google-ads/drafts/${draftId}`, { method: "PUT", body: { data: spec } });
        else setDraftId((await apiFetch("/api/google-ads/drafts", { method: "POST", body: { data: spec } })).draft.id);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [spec, open, draftId]);

  async function runCheck() {
    setChecking(true);
    try {
      setCheck(await apiFetch("/api/google-ads/check", { method: "POST", body: spec }));
    } catch (err) {
      setCheck({ ok: false, errors: [{ text: err.message }], warnings: [] });
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    if (step === 4 && !check) runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function publish() {
    modal.confirm({
      title: "Create this campaign in Google Ads?",
      icon: <Rocket size={18} aria-hidden="true" />,
      content: "Google creates everything at once — paused, so nothing spends until you turn it on. Google then reviews the ads (usually within a day).",
      okText: "Create",
      onOk: async () => {
        try {
          const id = draftId || (await apiFetch("/api/google-ads/drafts", { method: "POST", body: { data: spec } })).draft.id;
          if (draftId) await apiFetch(`/api/google-ads/drafts/${draftId}`, { method: "PUT", body: { data: spec } });
          setDraftId(id);
          const out = await apiFetch(`/api/google-ads/drafts/${id}/publish`, { method: "POST", body: { confirm: true } });
          setPublished({ ...out, draftId: id });
          onPublished?.();
        } catch (err) {
          modal.error({ title: "Google didn't create it", content: <div><p>{err.message}</p><p className="text-xs text-ink-muted m-0">Nothing was created, so you can fix this and try again safely.</p></div> });
        }
      },
    });
  }

  function launch() {
    modal.confirm({
      title: "Turn the campaign on?",
      content: `It can spend about ₹${Number(spec.campaign.budget).toLocaleString("en-IN")} a day, charged by Google to your Google Ads account.`,
      okText: "Turn on",
      onOk: async () => {
        try {
          await apiFetch(`/api/google-ads/drafts/${published.draftId}/launch`, { method: "POST", body: { confirm: true } });
          message.success("Turned on — ads run after Google's review");
          onClose();
        } catch (err) {
          message.error(err.message);
        }
      },
    });
  }

  if (!open) return null;
  const c = spec?.campaign;
  const type = c && caps.types[c.type];
  const updG = (i, patch) => set((s) => ({ ...s, adGroups: s.adGroups.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));
  const updA = (i, patch) => set((s) => ({ ...s, assetGroups: s.assetGroups.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));
  const pmax = c?.type === "PERFORMANCE_MAX";

  return (
    <Drawer open={open} onClose={onClose} width="min(1150px, 100vw)" destroyOnClose title={<span className="flex items-center gap-2">{c?.name || "New Google campaign"} <Tag className="!m-0">{saveState === "saved" ? "Draft saved" : saveState === "pending" ? "Saving…" : "Draft"}</Tag></span>}>
      {!spec ? (
        <Spin />
      ) : published ? (
        <div className="max-w-xl mx-auto text-center py-10">
          <CheckCircle2 size={40} className="text-status-success mx-auto" aria-hidden="true" />
          <h3 className="text-lg font-semibold mt-3">Created in Google Ads — paused</h3>
          <p className="text-sm text-ink-muted">Turn it on when you&apos;re ready. Google reviews the ads first.</p>
          <Space>
            <Button onClick={onClose}>Keep it paused</Button>
            <Button type="primary" icon={<Rocket size={14} aria-hidden="true" />} onClick={launch}>
              Turn on now
            </Button>
          </Space>
        </div>
      ) : (
        <Form layout="vertical" requiredMark={false}>
          <Steps current={step} onChange={setStep} size="small" className="mb-6" items={STEPS.map((title) => ({ title }))} />

          {step === 0 && (
            <div className="flex flex-col gap-4">
              <div className="grid sm:grid-cols-2 gap-2">
                {Object.entries(caps.types).map(([key, t]) => {
                  const blocked = t.needsMerchant && !caps.merchants.length;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={blocked}
                      onClick={() => setC({ type: key, bidding: t.bidding.includes(c.bidding) ? c.bidding : t.recommended })}
                      className={`text-left rounded-lg border p-3 ${c.type === key ? "border-accent ring-1 ring-accent bg-accent-soft" : "border-app-border"} ${blocked ? "opacity-50 cursor-not-allowed" : "hover:border-accent"}`}
                    >
                      <span className="font-medium block">{t.label}</span>
                      <span className="text-xs text-ink-muted block mt-0.5">{blocked ? "Needs Merchant Center linked to this Google Ads account." : t.hint}</span>
                    </button>
                  );
                })}
              </div>
              <Form.Item label="Campaign name" className="!mb-0">
                <Input value={c.name} maxLength={200} placeholder="for example Search — Diwali sweets" onChange={(e) => setC({ name: e.target.value })} />
              </Form.Item>
              {(pmax || c.type === "SHOPPING") && caps.merchants.length > 0 && (
                <Form.Item label="Merchant Center (your products)" className="!mb-0">
                  <Select allowClear={pmax} value={c.merchantId} onChange={(merchantId) => setC({ merchantId: merchantId || null })} options={caps.merchants.map((m) => ({ value: m, label: `Merchant Center ${m}` }))} />
                  {pmax && <Help>With it, Performance Max also shows your products with photos and prices.</Help>}
                </Form.Item>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4 max-w-2xl">
              <Form.Item label="Average daily budget" className="!mb-0">
                <InputNumber prefix="₹" min={1} value={c.budget} onChange={(budget) => setC({ budget })} />
                <Help>Google may spend up to 2× on a busy day, but never more than about 30.4× this in a month.</Help>
              </Form.Item>
              <Form.Item label="What should Google bid for?" className="!mb-0">
                <Radio.Group value={c.bidding} onChange={(e) => setC({ bidding: e.target.value })} className="flex flex-col gap-2">
                  {type.bidding.map((b) => (
                    <Radio key={b} value={b}>
                      <span className="font-medium">{caps.bidding[b].label}</span>
                      {b === type.recommended ? <Tag className="!ml-2">recommended</Tag> : null}
                      <Help>{caps.bidding[b].hint}</Help>
                    </Radio>
                  ))}
                </Radio.Group>
                {caps.bidding[c.bidding]?.needsConversions && !caps.purchaseTracking && <Alert className="mt-2" type="warning" showIcon message="Purchase tracking isn't set up — set it up in Account check first, or bid for clicks for now." />}
              </Form.Item>
              {c.bidding === "MAXIMIZE_CONVERSIONS" && (
                <Form.Item label="Target cost per purchase (optional)" className="!mb-0">
                  <InputNumber prefix="₹" min={1} value={c.targetCpa} onChange={(targetCpa) => setC({ targetCpa })} />
                  <Help>Leave empty at first; set it after you see what a purchase costs.</Help>
                </Form.Item>
              )}
              {(c.bidding === "MAXIMIZE_CONVERSION_VALUE" || c.bidding === "TARGET_ROAS") && (
                <Form.Item label={`Target return on ad spend${c.bidding === "TARGET_ROAS" ? "" : " (optional)"}`} className="!mb-0">
                  <InputNumber min={0.1} step={0.5} value={c.targetRoas} onChange={(targetRoas) => setC({ targetRoas })} addonAfter="× (₹ sales per ₹1)" />
                </Form.Item>
              )}
              {c.bidding === "MAXIMIZE_CLICKS" && (
                <Form.Item label="Maximum per click (optional)" className="!mb-0">
                  <InputNumber prefix="₹" min={1} value={c.maxCpc} onChange={(maxCpc) => setC({ maxCpc })} />
                </Form.Item>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                <Form.Item label="Start (optional)" className="!mb-0">
                  <DatePicker className="w-full" onChange={(d) => setC({ startDate: d ? d.format("YYYY-MM-DD") : null })} />
                </Form.Item>
                <Form.Item label="End (optional)" className="!mb-0">
                  <DatePicker className="w-full" onChange={(d) => setC({ endDate: d ? d.format("YYYY-MM-DD") : null })} />
                </Form.Item>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4 max-w-2xl">
              <Form.Item label="Show ads to people in" className="!mb-0">
                <SearchSelect value={c.locations} onChange={(locations) => setC({ locations })} placeholder="Search a country, state or city" />
              </Form.Item>
              <Form.Item label="Except people in (optional)" className="!mb-0">
                <SearchSelect value={c.excludedLocations} onChange={(excludedLocations) => setC({ excludedLocations })} placeholder="Search to exclude" />
              </Form.Item>
              <Form.Item label="Languages" className="!mb-0">
                <Select mode="multiple" showSearch optionFilterProp="label" value={c.languages.map((l) => l.id)} onChange={(ids) => setC({ languages: ids.map((id) => ({ id, name: languages.find((l) => l.id === id)?.name || id })) })} options={languages.map((l) => ({ value: l.id, label: l.name }))} />
                <Help>The languages your customers use Google in. English and Hindi cover most of India.</Help>
              </Form.Item>
              {c.type === "SEARCH" && (
                <Form.Item label="Also show on Google search partner sites" className="!mb-0">
                  <Switch checked={c.searchPartners} onChange={(searchPartners) => setC({ searchPartners })} />
                </Form.Item>
              )}
              {!pmax && (
                <Form.Item label="Negative keywords (optional)" className="!mb-0" extra="Searches that should never show your ads, one per line — e.g. free, recipe, job.">
                  <Input.TextArea rows={4} value={(c.negativeKeywords || []).map((k) => k.text).join("\n")} onChange={(e) => setC({ negativeKeywords: e.target.value.split("\n").map((t) => ({ text: t, matchType: "PHRASE" })) })} />
                </Form.Item>
              )}
            </div>
          )}

          {step === 3 && !pmax && (
            <div className="grid lg:grid-cols-[200px_1fr] gap-4">
              <div className="flex flex-col gap-1">
                {spec.adGroups.map((g, i) => (
                  <div key={g.key} role="button" tabIndex={0} onClick={() => setActive(i)} onKeyDown={(e) => e.key === "Enter" && setActive(i)} className={`rounded-md border px-2 py-1.5 cursor-pointer flex justify-between ${i === active ? "border-accent bg-accent-soft" : "border-app-border"}`}>
                    <span className="text-sm truncate">{g.name}</span>
                    <Button size="small" type="text" danger disabled={spec.adGroups.length === 1} icon={<Trash2 size={12} aria-hidden="true" />} onClick={(e) => { e.stopPropagation(); set((s) => ({ ...s, adGroups: s.adGroups.filter((_, j) => j !== i) })); setActive(0); }} aria-label="Remove ad group" />
                  </div>
                ))}
                <Button size="small" icon={<Plus size={13} aria-hidden="true" />} onClick={() => { set((s) => ({ ...s, adGroups: [...s.adGroups, blankAdGroup(storeUrl, s.adGroups.length + 1)] })); setActive(spec.adGroups.length); }}>
                  Add ad group
                </Button>
                <Help>One theme per ad group (e.g. &quot;Kaju katli&quot;, &quot;Gift boxes&quot;) with its own keywords and ads.</Help>
              </div>
              {spec.adGroups[active] && (() => {
                const g = spec.adGroups[active];
                return (
                  <div className="flex flex-col gap-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Form.Item label="Ad group name" className="!mb-0">
                        <Input value={g.name} onChange={(e) => updG(active, { name: e.target.value })} />
                      </Form.Item>
                      {(c.bidding === "MANUAL_CPC" || c.type === "SHOPPING") && (
                        <Form.Item label="Max cost per click" className="!mb-0">
                          <InputNumber prefix="₹" min={0.5} step={0.5} value={g.cpc} onChange={(cpc) => updG(active, { cpc })} />
                        </Form.Item>
                      )}
                    </div>
                    {c.type === "SEARCH" && (
                      <Card size="small" title="Keywords" extra={<Button size="small" icon={<Lightbulb size={13} aria-hidden="true" />} onClick={() => setIdeasFor(active)}>Keyword ideas</Button>}>
                        <Input.TextArea rows={5} placeholder={"One per line, e.g.\nkaju katli online\nbuy kaju katli"} value={g.keywords.map((k) => k.text).join("\n")} onChange={(e) => updG(active, { keywords: e.target.value.split("\n").map((text, i) => ({ text, matchType: g.keywords[i]?.matchType || "PHRASE" })) })} />
                        <div className="flex items-center gap-2 mt-2 text-sm">
                          Match type for all:
                          <Segmented size="small" value={g.keywords[0]?.matchType || "PHRASE"} onChange={(m) => updG(active, { keywords: g.keywords.map((k) => ({ ...k, matchType: m })) })} options={Object.entries(caps.matchTypes).map(([value, label]) => ({ value, label }))} />
                        </div>
                        <Help>Phrase: searches containing the meaning of your keyword (recommended). Exact: that search only. Broad: related searches too — best with purchase bidding.</Help>
                      </Card>
                    )}
                    {c.type !== "SHOPPING" &&
                      g.ads.map((a, j) => {
                        const updAd = (patch) => updG(active, { ads: g.ads.map((x, k) => (k === j ? { ...x, ...patch } : x)) });
                        return (
                          <Card key={a.key} size="small" title={`${c.type === "SEARCH" ? "Responsive search ad" : "Responsive display ad"} ${j + 1}`} extra={<Space><Button size="small" icon={<Sparkles size={13} aria-hidden="true" />} onClick={() => setAiFor({ group: active, ad: j })}>Write with AI</Button><Button size="small" danger disabled={g.ads.length === 1} icon={<Trash2 size={12} aria-hidden="true" />} onClick={() => updG(active, { ads: g.ads.filter((_, k) => k !== j) })} aria-label="Remove ad" /></Space>}>
                            <Form.Item label="Link (final URL)" className="!mb-2">
                              <Input value={a.finalUrl} placeholder="https://" onChange={(e) => updAd({ finalUrl: e.target.value.trim() })} />
                            </Form.Item>
                            {c.type === "SEARCH" ? (
                              <>
                                <TextList label="Headlines" items={a.headlines} onChange={(headlines) => updAd({ headlines })} max={15} min={3} limit={30} hint="Google mixes these. Include your keyword, price or offer, and your brand. 8+ is best." />
                                <TextList label="Descriptions" items={a.descriptions} onChange={(descriptions) => updAd({ descriptions })} max={4} min={2} limit={90} />
                                <div className="grid grid-cols-2 gap-2">
                                  <Input addonBefore="Path 1" maxLength={15} value={a.path1} onChange={(e) => updAd({ path1: e.target.value })} />
                                  <Input addonBefore="Path 2" maxLength={15} value={a.path2} onChange={(e) => updAd({ path2: e.target.value })} />
                                </div>
                              </>
                            ) : (
                              <>
                                <TextList label="Headlines" items={a.headlines} onChange={(headlines) => updAd({ headlines })} max={5} min={1} limit={30} />
                                <Form.Item label="Long headline" className="!mb-2">
                                  <Input maxLength={90} showCount value={a.longHeadline} onChange={(e) => updAd({ longHeadline: e.target.value })} />
                                </Form.Item>
                                <TextList label="Descriptions" items={a.descriptions} onChange={(descriptions) => updAd({ descriptions })} max={5} min={1} limit={90} />
                                <Form.Item label="Business name" className="!mb-2">
                                  <Input maxLength={25} showCount value={a.businessName} onChange={(e) => updAd({ businessName: e.target.value })} />
                                </Form.Item>
                                <ImageSlots value={a.images} slots={["landscape", "square", "logo"]} onChange={(images) => updAd({ images })} />
                              </>
                            )}
                          </Card>
                        );
                      })}
                    {c.type !== "SHOPPING" && (
                      <Button className="self-start" icon={<Plus size={13} aria-hidden="true" />} onClick={() => updG(active, { ads: [...g.ads, blankAd(storeUrl)] })}>
                        Add another ad
                      </Button>
                    )}
                    {c.type === "SHOPPING" && <Alert type="info" showIcon message="Shopping ads are built by Google from your Merchant Center products (photo, title, price) — nothing to write. This ad group covers all products." />}
                  </div>
                );
              })()}
            </div>
          )}

          {step === 3 && pmax && (
            <div className="grid lg:grid-cols-[200px_1fr] gap-4">
              <div className="flex flex-col gap-1">
                {spec.assetGroups.map((g, i) => (
                  <div key={g.key} role="button" tabIndex={0} onClick={() => setActive(i)} onKeyDown={(e) => e.key === "Enter" && setActive(i)} className={`rounded-md border px-2 py-1.5 cursor-pointer flex justify-between ${i === active ? "border-accent bg-accent-soft" : "border-app-border"}`}>
                    <span className="text-sm truncate">{g.name}</span>
                    <Button size="small" type="text" danger disabled={spec.assetGroups.length === 1} icon={<Trash2 size={12} aria-hidden="true" />} onClick={(e) => { e.stopPropagation(); set((s) => ({ ...s, assetGroups: s.assetGroups.filter((_, j) => j !== i) })); setActive(0); }} aria-label="Remove asset group" />
                  </div>
                ))}
                <Button size="small" icon={<Plus size={13} aria-hidden="true" />} onClick={() => { set((s) => ({ ...s, assetGroups: [...s.assetGroups, blankAssetGroup(storeUrl, storeName, s.assetGroups.length + 1)] })); setActive(spec.assetGroups.length); }}>
                  Add asset group
                </Button>
                <Help>An asset group is one theme or product range with its own text and images.</Help>
              </div>
              {spec.assetGroups[active] && (() => {
                const g = spec.assetGroups[active];
                return (
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-end">
                      <Button size="small" icon={<Sparkles size={13} aria-hidden="true" />} onClick={() => setAiFor({ asset: active })}>Write with AI</Button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Form.Item label="Asset group name" className="!mb-2">
                        <Input value={g.name} onChange={(e) => updA(active, { name: e.target.value })} />
                      </Form.Item>
                      <Form.Item label="Link (final URL)" className="!mb-2">
                        <Input value={g.finalUrl} placeholder="https://" onChange={(e) => updA(active, { finalUrl: e.target.value.trim() })} />
                      </Form.Item>
                    </div>
                    <TextList label="Headlines" items={g.headlines} onChange={(headlines) => updA(active, { headlines })} max={15} min={3} limit={30} />
                    <TextList label="Long headlines" items={g.longHeadlines} onChange={(longHeadlines) => updA(active, { longHeadlines })} max={5} min={1} limit={90} />
                    <TextList label="Descriptions" items={g.descriptions} onChange={(descriptions) => updA(active, { descriptions })} max={5} min={2} limit={90} hint="At least one 60 characters or fewer." />
                    <Form.Item label="Business name" className="!mb-2">
                      <Input maxLength={25} showCount value={g.businessName} onChange={(e) => updA(active, { businessName: e.target.value })} />
                    </Form.Item>
                    <ImageSlots value={g.images} slots={["landscape", "square", "portrait", "logo"]} onChange={(images) => updA(active, { images })} />
                    {c.merchantId && (
                      <Form.Item label="Products" className="!mb-0 mt-2">
                        <Switch checked={g.allProducts !== false} onChange={(allProducts) => updA(active, { allProducts })} /> <span className="text-sm">All products from Merchant Center</span>
                      </Form.Item>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4 max-w-3xl">
              {checking || !check ? (
                <Spin />
              ) : check.ok ? (
                <Alert type="success" showIcon icon={<ShieldCheck size={16} aria-hidden="true" />} message={check.google === "ok" ? "Google checked it — ready to create" : "Ready"} />
              ) : (
                <Alert type="error" showIcon message={check.google === "rejected" ? "Google would reject this" : "Fix these first"} description={<ul className="m-0 pl-4">{check.errors.map((e, i) => <li key={i}>{e.text}</li>)}</ul>} />
              )}
              {check?.warnings?.length > 0 && <Alert type="warning" showIcon message="Worth a look" description={<ul className="m-0 pl-4">{check.warnings.map((e, i) => <li key={i}>{e.text}</li>)}</ul>} />}
              <Card size="small" title="Summary">
                <p className="m-0 text-sm">
                  <b>{c.name || "Untitled"}</b> · {caps.types[c.type]?.label} · ₹{Number(c.budget || 0).toLocaleString("en-IN")}/day · {caps.bidding[c.bidding]?.label}
                </p>
                <p className="m-0 text-sm mt-1">Where: {c.locations.map((l) => l.name).join(", ") || "—"} · Languages: {c.languages.map((l) => l.name).join(", ") || "any"}</p>
                <p className="m-0 text-sm mt-1">{pmax ? `${spec.assetGroups.length} asset group(s)` : `${spec.adGroups.length} ad group(s), ${spec.adGroups.reduce((n, g) => n + (g.keywords || []).filter((k) => k.text.trim()).length, 0)} keywords`}</p>
              </Card>
              <Help>Every ad link carries utm_source=google and the campaign id, so your store can count its orders from these ads.</Help>
              <Button className="self-start" onClick={runCheck} loading={checking}>Check again with Google</Button>
            </div>
          )}

          <div className="flex justify-between mt-8">
            <Button disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
            {step < 4 ? (
              <Button type="primary" onClick={() => setStep(step + 1)}>Next</Button>
            ) : (
              <Button type="primary" icon={<Rocket size={14} aria-hidden="true" />} disabled={!check?.ok} onClick={publish}>
                Create (paused)
              </Button>
            )}
          </div>
        </Form>
      )}
      <KeywordIdeas
        open={ideasFor != null}
        url={spec?.adGroups?.[ideasFor]?.ads?.[0]?.finalUrl || storeUrl}
        locations={c?.locations || []}
        language={c?.languages?.[0]?.id}
        onClose={() => setIdeasFor(null)}
        onAdd={(words) => {
          const g = spec.adGroups[ideasFor];
          const mt = g.keywords[0]?.matchType || "PHRASE";
          const have = new Set(g.keywords.map((k) => k.text.trim().toLowerCase()));
          updG(ideasFor, { keywords: [...g.keywords.filter((k) => k.text.trim()), ...words.filter((w) => !have.has(w.toLowerCase())).map((text) => ({ text, matchType: mt }))] });
          setIdeasFor(null);
        }}
      />
      <AiCopy
        open={Boolean(aiFor)}
        type={c?.type}
        onClose={() => setAiFor(null)}
        onUse={(ideas) => {
          if (aiFor?.asset != null) updA(aiFor.asset, { headlines: ideas.headlines.length >= 3 ? ideas.headlines : spec.assetGroups[aiFor.asset].headlines, longHeadlines: ideas.longHeadlines.length ? ideas.longHeadlines : spec.assetGroups[aiFor.asset].longHeadlines, descriptions: ideas.descriptions.length >= 2 ? ideas.descriptions.slice(0, 5) : spec.assetGroups[aiFor.asset].descriptions });
          else if (aiFor) {
            const g = spec.adGroups[aiFor.group];
            const max = c.type === "SEARCH" ? 15 : 5;
            updG(aiFor.group, { ads: g.ads.map((a, k) => (k === aiFor.ad ? { ...a, headlines: ideas.headlines.slice(0, max), descriptions: ideas.descriptions.slice(0, c.type === "SEARCH" ? 4 : 5), longHeadline: c.type === "DISPLAY" ? ideas.longHeadlines[0] || a.longHeadline : a.longHeadline } : a)) });
          }
          setAiFor(null);
        }}
      />
    </Drawer>
  );
}
