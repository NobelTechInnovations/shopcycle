"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Drawer, Steps, Button, Segmented, Form, Input, InputNumber, Select, Radio, DatePicker, Switch, Checkbox, Alert, Card, Tag, Space, App, Modal, Tooltip, Spin, Empty, Collapse } from "antd";
import { Plus, Trash2, Copy, Sparkles, Image as ImageIcon, Film, Eye, CheckCircle2, AlertTriangle, Rocket } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { MediaPicker } from "./Media";
import { inr, useCaps } from "./ads-ui";

const rid = () => Math.random().toString(36).slice(2, 9);

function blankAd(caps, link, n = 1) {
  // The Page and Instagram account chosen when connecting; else the first Page and its Instagram.
  const page = caps?.pages?.find((p) => p.id === caps?.defaults?.pageId) || caps?.pages?.[0];
  const igId = caps?.defaults?.instagramId || page?.instagram?.id || null;
  return { key: rid(), name: `Ad ${n}`, format: "image", identity: { pageId: page?.id || null, instagramId: igId }, primaryText: "", headline: "", description: "", link: link || "", cta: "SHOP_NOW", imageHash: null, imagePreview: null, videoId: null, videoPreview: null, thumbnailHash: null, thumbnailPreview: null, cards: [] };
}
function blankAdSet(caps, objective, link, n = 1) {
  const goal = caps?.objectives?.[objective]?.recommended || "landing_page_views";
  const pixel = caps?.pixels?.find((p) => p.active) || caps?.pixels?.[0];
  return {
    key: rid(),
    name: `Ad set ${n}`,
    goal: caps?.goals?.[goal]?.needsPixel && !pixel ? "landing_page_views" : goal,
    pixelId: pixel?.id || null,
    budget: 500,
    startTime: null,
    endTime: null,
    targeting: { countries: ["IN"], regions: [], cities: [], excludedRegions: [], ageMin: 18, ageMax: 65, genders: [], locales: [], interests: [], customAudiences: [], excludedAudiences: [], advantageAudience: true },
    placements: { mode: "automatic", platforms: ["facebook", "instagram"], facebook: [], instagram: [], devices: [] },
    ads: [blankAd(caps, link)],
  };
}
function blankSpec(caps, link) {
  return {
    campaign: { name: "", objective: "OUTCOME_SALES", budgetLevel: "campaign", budgetType: "daily", budget: 500, bidStrategy: "LOWEST_COST_WITHOUT_CAP", bidAmount: null, roasFloor: null, specialAdCategories: [], startTime: null, endTime: null },
    adSets: [blankAdSet(caps, "OUTCOME_SALES", link)],
  };
}

function Help({ children }) {
  return <p className="text-xs text-ink-muted mt-1 mb-0">{children}</p>;
}

// ── Step 1: goal ──────────────────────────────────────────────────────

function GoalStep({ spec, set, caps, advanced }) {
  const c = spec.campaign;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-medium m-0 mb-2">What do you want from this campaign?</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(caps.objectives).map(([key, o]) => (
            <button
              key={key}
              type="button"
              disabled={Boolean(o.unavailable)}
              onClick={() =>
                set((s) => ({
                  ...s,
                  campaign: { ...s.campaign, objective: key, bidStrategy: key !== "OUTCOME_SALES" && s.campaign.bidStrategy === "LOWEST_COST_WITH_MIN_ROAS" ? "LOWEST_COST_WITHOUT_CAP" : s.campaign.bidStrategy },
                  adSets: s.adSets.map((a) => ({ ...a, goal: caps.objectives[key].goals.includes(a.goal) ? a.goal : caps.objectives[key].recommended })),
                }))
              }
              className={`text-left rounded-lg border p-3 ${c.objective === key ? "border-accent ring-1 ring-accent bg-accent-soft" : "border-app-border bg-app-surface"} ${o.unavailable ? "opacity-50 cursor-not-allowed" : "hover:border-accent"}`}
            >
              <span className="font-medium block">{o.label}</span>
              <span className="text-xs text-ink-muted block mt-0.5">{o.unavailable || o.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <Form.Item label="Campaign name" className="!mb-0">
        <Input value={c.name} maxLength={200} placeholder="for example Diwali sweets — Delhi" onChange={(e) => set((s) => ({ ...s, campaign: { ...s.campaign, name: e.target.value } }))} />
      </Form.Item>
      {advanced && (
        <Form.Item label="Special ad category" className="!mb-0" extra="Required by Meta for ads about credit, jobs, housing or politics. It limits targeting. Most stores choose none.">
          <Select mode="multiple" allowClear placeholder="None" value={c.specialAdCategories} onChange={(v) => set((s) => ({ ...s, campaign: { ...s.campaign, specialAdCategories: v } }))} options={Object.entries(caps.specialCategories).map(([value, label]) => ({ value, label }))} />
        </Form.Item>
      )}
    </div>
  );
}

// ── Step 2: budget ────────────────────────────────────────────────────

function BudgetStep({ spec, set, caps, advanced }) {
  const c = spec.campaign;
  const setC = (patch) => set((s) => ({ ...s, campaign: { ...s.campaign, ...patch } }));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-medium m-0 mb-2">Where is the budget set?</p>
        <Radio.Group value={c.budgetLevel} onChange={(e) => setC({ budgetLevel: e.target.value })} className="flex flex-col gap-2">
          <Radio value="campaign">
            <span className="font-medium">One budget for the whole campaign (recommended)</span>
            <Help>Meta moves money to whichever ad set is getting the best results each day. Simplest, and usually cheapest per result.</Help>
          </Radio>
          <Radio value="adset">
            <span className="font-medium">A budget for each ad set</span>
            <Help>You decide exactly how much each audience gets — useful for testing audiences against each other fairly.</Help>
          </Radio>
        </Radio.Group>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Form.Item label="Budget type" className="!mb-0">
          <Segmented value={c.budgetType} onChange={(budgetType) => setC({ budgetType })} options={[{ value: "daily", label: "Daily" }, { value: "lifetime", label: "Total (lifetime)" }]} />
          <Help>{c.budgetType === "daily" ? "An average per day — some days Meta spends up to 75% more, balanced across the week." : "Spread over the whole schedule. Needs an end date."}</Help>
        </Form.Item>
        {c.budgetLevel === "campaign" && (
          <Form.Item label={c.budgetType === "daily" ? "Daily budget" : "Total budget"} className="!mb-0">
            <InputNumber className="w-full" min={1} prefix="₹" value={c.budget} onChange={(budget) => setC({ budget })} />
            {c.budgetType === "daily" && Number(c.budget) < caps.minDaily && <Help>Under ₹{caps.minDaily} a day usually delivers very little.</Help>}
          </Form.Item>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Form.Item label="Start" className="!mb-0" extra="Empty: as soon as you turn it on.">
          <DatePicker showTime={{ format: "h:mm a" }} format="D MMM YYYY, h:mm a" className="w-full" onChange={(d) => setC({ startTime: d ? d.toISOString() : null })} />
        </Form.Item>
        <Form.Item label={`End${c.budgetType === "lifetime" ? "" : " (optional)"}`} className="!mb-0">
          <DatePicker showTime={{ format: "h:mm a" }} format="D MMM YYYY, h:mm a" className="w-full" onChange={(d) => setC({ endTime: d ? d.toISOString() : null })} />
        </Form.Item>
      </div>
      {advanced && (
        <div>
          <Form.Item label="Bid strategy" className="!mb-0">
            <Select
              value={c.bidStrategy}
              onChange={(bidStrategy) => setC({ bidStrategy })}
              options={Object.entries(caps.bidStrategies).map(([value, b]) => ({ value, label: b.label, disabled: value === "LOWEST_COST_WITH_MIN_ROAS" && c.objective !== "OUTCOME_SALES" }))}
            />
            <Help>{caps.bidStrategies[c.bidStrategy]?.hint}</Help>
          </Form.Item>
          {["COST_CAP", "LOWEST_COST_WITH_BID_CAP"].includes(c.bidStrategy) && (
            <Form.Item label={c.bidStrategy === "COST_CAP" ? "Target cost per result" : "Bid cap"} className="!mb-0 mt-3">
              <InputNumber prefix="₹" min={1} value={c.bidAmount} onChange={(bidAmount) => setC({ bidAmount })} />
            </Form.Item>
          )}
          {c.bidStrategy === "LOWEST_COST_WITH_MIN_ROAS" && (
            <Form.Item label="ROAS goal" className="!mb-0 mt-3" extra="2 means ₹2 of sales for every ₹1 spent.">
              <InputNumber min={0.1} step={0.1} value={c.roasFloor} onChange={(roasFloor) => setC({ roasFloor })} />
            </Form.Item>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step 3: audiences (ad sets) ───────────────────────────────────────

function SearchSelect({ type, value, onChange, placeholder, mode = "multiple" }) {
  const [opts, setOpts] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const search = (q) => {
    clearTimeout(timer.current);
    if (!q || q.length < 2) return;
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const d = await apiFetch(`/api/meta-ads/targeting/search?type=${type}&q=${encodeURIComponent(q)}`);
        setOpts(d.results);
      } catch {
        setOpts([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };
  const key = (o) => String(o.key ?? o.id);
  return (
    <Select
      mode={mode}
      labelInValue
      showSearch
      filterOption={false}
      onSearch={search}
      notFoundContent={loading ? <Spin size="small" /> : "Type to search"}
      placeholder={placeholder}
      value={(value || []).map((v) => ({ value: key(v), label: v.label || v.name }))}
      onChange={(sel) => onChange(sel.map((s) => opts.find((o) => key(o) === s.value) || (value || []).find((v) => key(v) === s.value) || { key: s.value, name: s.label, label: s.label }))}
      options={opts.map((o) => ({ value: key(o), label: o.label || `${o.name}${o.size ? ` · ${o.size}` : ""}` }))}
      className="w-full"
    />
  );
}

function Estimate({ adSet, specialAdCategories }) {
  const [est, setEst] = useState(null);
  const [error, setError] = useState(null);
  const key = JSON.stringify([adSet.targeting, adSet.goal, specialAdCategories]);
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        setError(null);
        const d = await apiFetch("/api/meta-ads/targeting/estimate", { method: "POST", body: { targeting: adSet.targeting, goal: adSet.goal, specialAdCategories } });
        setEst(d.estimate);
      } catch (err) {
        setError(err.message);
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (error) return <p className="text-xs text-ink-muted m-0">Audience size unavailable: {error}</p>;
  if (!est) return <p className="text-xs text-ink-muted m-0">Estimating audience size…</p>;
  const lo = est.lower;
  const tone = lo == null ? "" : lo < 50000 ? "text-status-warning" : "text-status-success";
  return (
    <p className={`text-xs m-0 ${tone}`}>
      Estimated audience: {est.lower != null ? `${Number(est.lower).toLocaleString("en-IN")}–${Number(est.upper).toLocaleString("en-IN")} people` : "not available yet"}
      {lo != null && lo < 50000 ? " — quite narrow; costs may be higher. Consider more locations or fewer interests." : ""}
    </p>
  );
}

function AdSetEditor({ adSet, update, caps, campaign, advanced }) {
  const t = adSet.targeting;
  const setT = (patch) => update({ targeting: { ...t, ...patch } });
  const obj = caps.objectives[campaign.objective];
  const goal = caps.goals[adSet.goal];
  const locations = [...(t.countries || []).map((c) => ({ key: c, name: c === "IN" ? "India" : c, type: "country", label: c === "IN" ? "India (country)" : c })), ...(t.regions || []), ...(t.cities || [])];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <Form.Item label="Ad set name" className="!mb-0">
          <Input value={adSet.name} onChange={(e) => update({ name: e.target.value })} maxLength={200} />
        </Form.Item>
        <Form.Item label="Get as many as possible of" className="!mb-0">
          <Select value={adSet.goal} onChange={(g) => update({ goal: g })} options={(obj?.goals || []).map((g) => ({ value: g, label: `${caps.goals[g].label}${g === obj.recommended ? " (recommended)" : ""}`, disabled: caps.goals[g].needsPixel && !caps.pixels.length }))} />
          {goal?.needsPixel && !caps.pixels.length && <Help>Needs a Meta Pixel — set it up in Apps ▸ Meta Pixel.</Help>}
          {goal?.destination === "WHATSAPP" && <Help>Ads open a WhatsApp chat with your business. The Facebook Page must be linked to your WhatsApp Business number.</Help>}
        </Form.Item>
      </div>
      {goal?.needsPixel && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Form.Item label="Pixel (tracking)" className="!mb-0">
            <Select value={adSet.pixelId} onChange={(pixelId) => update({ pixelId })} options={caps.pixels.map((p) => ({ value: p.id, label: `${p.name}${p.active ? "" : " (no activity this week)"}` }))} />
          </Form.Item>
          <Form.Item label="Counts as a result" className="!mb-0">
            <Input disabled value={goal.event === "PURCHASE" ? "Purchase" : goal.event === "ADD_TO_CART" ? "Add to cart" : "Lead"} />
          </Form.Item>
        </div>
      )}
      {campaign.budgetLevel === "adset" && (
        <Form.Item label={campaign.budgetType === "daily" ? "Daily budget for this ad set" : "Total budget for this ad set"} className="!mb-0">
          <InputNumber prefix="₹" min={1} value={adSet.budget} onChange={(budget) => update({ budget })} />
        </Form.Item>
      )}
      <div>
        <p className="font-medium m-0 mb-1">Who sees the ads</p>
        <Form.Item label="Locations" className="!mb-2">
          <SearchSelect
            type="location"
            placeholder="Search a country, state or city"
            value={locations}
            onChange={(list) =>
              setT({
                countries: list.filter((l) => l.type === "country").map((l) => l.key || l.country),
                regions: list.filter((l) => l.type === "region").map((l) => ({ key: l.key, name: l.name, label: l.label })),
                cities: list.filter((l) => l.type === "city").map((l) => ({ key: l.key, name: l.name, label: l.label, radius: 10 })),
              })
            }
          />
        </Form.Item>
        <div className="grid sm:grid-cols-3 gap-3">
          <Form.Item label="Age" className="!mb-0">
            <Space.Compact>
              <InputNumber min={18} max={65} value={t.ageMin} onChange={(ageMin) => setT({ ageMin })} />
              <InputNumber min={18} max={65} value={t.ageMax} onChange={(ageMax) => setT({ ageMax })} addonAfter={t.ageMax === 65 ? "+" : null} />
            </Space.Compact>
          </Form.Item>
          <Form.Item label="Gender" className="!mb-0">
            <Segmented value={t.genders.length === 1 ? String(t.genders[0]) : "all"} onChange={(v) => setT({ genders: v === "all" ? [] : [Number(v)] })} options={[{ value: "all", label: "All" }, { value: "2", label: "Women" }, { value: "1", label: "Men" }]} />
          </Form.Item>
          <Form.Item label="Advantage+ audience" className="!mb-0">
            <Switch checked={t.advantageAudience} onChange={(advantageAudience) => setT({ advantageAudience })} />
            <Help>{t.advantageAudience ? "Meta may also show ads beyond your age and interests when it finds likely buyers. Usually cheaper." : "Ads stay strictly within your choices."}</Help>
          </Form.Item>
        </div>
        <Form.Item label="Interests (optional)" className="!mb-0 mt-2" extra="Leave empty to let Meta find buyers — often works best with a Pixel.">
          <SearchSelect type="interest" placeholder="Search interests, e.g. Indian sweets, Diwali" value={t.interests} onChange={(interests) => setT({ interests: interests.map((i) => ({ id: i.id || i.key, name: i.name })) })} />
        </Form.Item>
        {advanced && (
          <Collapse
            ghost
            className="mt-2"
            items={[
              {
                key: "more",
                label: "More audience options",
                children: (
                  <div className="flex flex-col gap-3">
                    <Form.Item label="Languages" className="!mb-0">
                      <SearchSelect type="locale" placeholder="Any language" value={t.locales} onChange={(locales) => setT({ locales: locales.map((l) => ({ key: l.key, name: l.name })) })} />
                    </Form.Item>
                    <Form.Item label="Exclude these states or cities" className="!mb-0">
                      <SearchSelect type="location" placeholder="Search to exclude" value={[...(t.excludedRegions || []), ...(t.excludedCities || [])]} onChange={(list) => setT({ excludedRegions: list.filter((l) => l.type === "region"), excludedCities: list.filter((l) => l.type === "city").map((l) => ({ ...l, radius: 10 })) })} />
                    </Form.Item>
                    <Form.Item label="Custom audiences (include)" className="!mb-0" extra={!caps.audiences.length ? "None yet — create customer lists or website visitors in Meta Ads Manager ▸ Audiences." : "Lookalike audiences appear here too."}>
                      <Select mode="multiple" allowClear value={t.customAudiences.map((a) => a.id)} onChange={(ids) => setT({ customAudiences: ids.map((id) => ({ id })) })} options={caps.audiences.map((a) => ({ value: a.id, label: `${a.name} · ${a.type?.toLowerCase()} · ${a.size}${a.ready ? "" : " (not ready)"}`, disabled: !a.ready }))} />
                    </Form.Item>
                    <Form.Item label="Exclude audiences" className="!mb-0" extra="For example your existing buyers, so ads reach new people.">
                      <Select mode="multiple" allowClear value={t.excludedAudiences.map((a) => a.id)} onChange={(ids) => setT({ excludedAudiences: ids.map((id) => ({ id })) })} options={caps.audiences.map((a) => ({ value: a.id, label: a.name }))} />
                    </Form.Item>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Form.Item label="Ad set start (overrides campaign)" className="!mb-0">
                        <DatePicker showTime={{ format: "h:mm a" }} format="D MMM, h:mm a" className="w-full" onChange={(d) => update({ startTime: d ? d.toISOString() : null })} />
                      </Form.Item>
                      <Form.Item label="Ad set end" className="!mb-0">
                        <DatePicker showTime={{ format: "h:mm a" }} format="D MMM, h:mm a" className="w-full" onChange={(d) => update({ endTime: d ? d.toISOString() : null })} />
                      </Form.Item>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        )}
        <div className="mt-2">
          <Estimate adSet={adSet} specialAdCategories={campaign.specialAdCategories} />
        </div>
      </div>
      <div>
        <p className="font-medium m-0 mb-1">Placements</p>
        <Radio.Group value={adSet.placements.mode} onChange={(e) => update({ placements: { ...adSet.placements, mode: e.target.value } })}>
          <Radio value="automatic">Automatic (recommended) — Meta places ads where they work best</Radio>
          {advanced && <Radio value="manual">Choose placements</Radio>}
        </Radio.Group>
        {adSet.placements.mode === "manual" && (
          <div className="mt-2 grid sm:grid-cols-2 gap-3">
            <Checkbox.Group value={adSet.placements.platforms} onChange={(platforms) => update({ placements: { ...adSet.placements, platforms } })} options={[{ value: "facebook", label: "Facebook" }, { value: "instagram", label: "Instagram" }, { value: "messenger", label: "Messenger" }, { value: "audience_network", label: "Audience Network", disabled: goal?.destination === "WHATSAPP" }]} />
            <Select mode="multiple" placeholder="Devices: all" value={adSet.placements.devices} onChange={(devices) => update({ placements: { ...adSet.placements, devices } })} options={[{ value: "mobile", label: "Phones" }, { value: "desktop", label: "Computers" }]} />
            {adSet.placements.platforms.includes("facebook") && <Select mode="multiple" placeholder="Facebook: all positions" value={adSet.placements.facebook} onChange={(facebook) => update({ placements: { ...adSet.placements, facebook } })} options={caps.placements.facebook.map((v) => ({ value: v, label: v.replace(/_/g, " ") }))} />}
            {adSet.placements.platforms.includes("instagram") && <Select mode="multiple" placeholder="Instagram: all positions" value={adSet.placements.instagram} onChange={(instagram) => update({ placements: { ...adSet.placements, instagram } })} options={caps.placements.instagram.map((v) => ({ value: v, label: v.replace(/_/g, " ") }))} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 4: ads ───────────────────────────────────────────────────────

function AiIdeas({ open, onClose, onUse, goal }) {
  const { message } = App.useApp();
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState(null);
  const [angle, setAngle] = useState("");
  const [ideas, setIdeas] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && !products.length) apiFetch("/api/products?pageSize=50").then((d) => setProducts(d.products || d.items || [])).catch(() => {});
  }, [open, products.length]);
  async function run() {
    setBusy(true);
    try {
      setIdeas((await apiFetch("/api/meta-ads/ai/copy", { method: "POST", body: { productId, angle, goal } })).variations);
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onCancel={onClose} title="Ad copy ideas" footer={null} width={720}>
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 mb-3">
        <Select showSearch allowClear placeholder="About which product? (optional)" value={productId} onChange={setProductId} optionFilterProp="label" options={products.map((p) => ({ value: p.id, label: p.title }))} />
        <Input placeholder="Angle, e.g. festive gifting, freshness" value={angle} onChange={(e) => setAngle(e.target.value)} />
        <Button type="primary" icon={<Sparkles size={14} aria-hidden="true" />} loading={busy} onClick={run}>
          Suggest
        </Button>
      </div>
      <p className="text-xs text-ink-muted">Ideas follow Meta&apos;s ad rules and use only your product&apos;s real details. Read and edit before using.</p>
      <div className="flex flex-col gap-2">
        {(ideas || []).map((v, i) => (
          <Card key={i} size="small" title={v.angle} extra={<Button size="small" onClick={() => onUse(v)}>Use</Button>}>
            <p className="m-0 text-sm">{v.primaryText}</p>
            <p className="m-0 mt-1 text-sm font-semibold">{v.headline}</p>
            {v.description && <p className="m-0 text-xs text-ink-muted">{v.description}</p>}
          </Card>
        ))}
      </div>
    </Modal>
  );
}

function Previews({ ad, goal }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      setData(await apiFetch("/api/meta-ads/previews", { method: "POST", body: { ad, goal, formats: ["facebook_feed", "instagram_feed", "instagram_story", "instagram_reels"] } }));
    } catch (err) {
      setData({ error: { error: err.message } });
    } finally {
      setBusy(false);
    }
  }
  const labels = { facebook_feed: "Facebook feed", instagram_feed: "Instagram feed", instagram_story: "Instagram Stories", instagram_reels: "Instagram Reels" };
  return (
    <div>
      <Button size="small" icon={<Eye size={13} aria-hidden="true" />} loading={busy} onClick={load}>
        {data ? "Refresh previews" : "Preview on Facebook and Instagram"}
      </Button>
      {data && (
        <div className="flex gap-3 overflow-x-auto mt-3 pb-2">
          {Object.entries(data).map(([k, v]) => (
            <div key={k} className="shrink-0">
              <p className="text-xs text-ink-muted m-0 mb-1">{labels[k] || k}</p>
              {v.src ? <iframe title={labels[k]} src={v.src} className="border border-app-border rounded-md bg-white" style={{ width: 300, height: k.includes("story") || k.includes("reels") ? 540 : 470 }} /> : <p className="text-xs text-status-danger w-60">{v.error || "No preview"}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdEditor({ ad, update, caps, goal, advanced }) {
  const [picker, setPicker] = useState(null); // { kind, target: "main"|"thumb"|cardIndex }
  const [ideas, setIdeas] = useState(false);
  const page = caps.pages.find((p) => p.id === ad.identity.pageId);
  const whatsapp = caps.goals[goal]?.destination === "WHATSAPP";
  return (
    <div className="flex flex-col gap-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <Form.Item label="Ad name" className="!mb-0">
          <Input value={ad.name} onChange={(e) => update({ name: e.target.value })} />
        </Form.Item>
        <Form.Item label="Facebook Page" className="!mb-0">
          <Select value={ad.identity.pageId} onChange={(pageId) => update({ identity: { pageId, instagramId: caps.pages.find((p) => p.id === pageId)?.instagram?.id || ad.identity.instagramId || null } })} options={caps.pages.map((p) => ({ value: p.id, label: p.name }))} />
        </Form.Item>
        <Form.Item label="Instagram account" className="!mb-0">
          <Select
            allowClear
            placeholder="None — use the Page"
            value={ad.identity.instagramId}
            onChange={(instagramId) => update({ identity: { ...ad.identity, instagramId: instagramId || null } })}
            options={(caps.instagramAccounts || []).map((i) => ({ value: i.id, label: `@${i.username || i.id}${i.pageId === ad.identity.pageId ? " · this Page's" : ""}` }))}
            notFoundContent="No Instagram account linked to your Page or ad account."
          />
        </Form.Item>
      </div>
      <Form.Item label="Format" className="!mb-0">
        <Segmented value={ad.format} onChange={(format) => update({ format, cards: format === "carousel" && !ad.cards.length ? [{ key: rid() }, { key: rid() }] : ad.cards })} options={[{ value: "image", label: "Single image" }, { value: "video", label: "Video" }, { value: "carousel", label: "Carousel" }]} />
      </Form.Item>
      {ad.format === "image" && (
        <div className="flex items-center gap-3">
          {ad.imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.imagePreview} alt="" className="w-24 h-24 object-cover rounded-md border border-app-border" />
          ) : (
            <span className="w-24 h-24 rounded-md border border-dashed border-app-border grid place-items-center text-ink-muted"><ImageIcon size={20} aria-hidden="true" /></span>
          )}
          <Button onClick={() => setPicker({ kind: "image", target: "main" })}>{ad.imageHash ? "Change image" : "Choose image"}</Button>
        </div>
      )}
      {ad.format === "video" && (
        <div className="flex flex-wrap items-center gap-3">
          {ad.videoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.videoPreview} alt="" className="w-24 h-24 object-cover rounded-md border border-app-border" />
          ) : (
            <span className="w-24 h-24 rounded-md border border-dashed border-app-border grid place-items-center text-ink-muted"><Film size={20} aria-hidden="true" /></span>
          )}
          <Button onClick={() => setPicker({ kind: "video", target: "main" })}>{ad.videoId ? "Change video" : "Choose video"}</Button>
          <Button onClick={() => setPicker({ kind: "image", target: "thumb" })}>{ad.thumbnailHash ? "Change cover image" : "Choose cover image"}</Button>
          {ad.thumbnailPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.thumbnailPreview} alt="" className="w-12 h-12 object-cover rounded border border-app-border" />
          )}
        </div>
      )}
      {ad.format === "carousel" && (
        <div className="flex flex-col gap-2">
          {ad.cards.map((card, k) => (
            <div key={card.key} className="grid grid-cols-[64px_1fr_1fr_auto] gap-2 items-center">
              <button type="button" onClick={() => setPicker({ kind: "image", target: k })} className="w-16 h-16 rounded border border-dashed border-app-border overflow-hidden grid place-items-center" aria-label={`Card ${k + 1} image`}>
                {card.imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.imagePreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={16} className="text-ink-muted" aria-hidden="true" />
                )}
              </button>
              <Input placeholder={`Card ${k + 1} headline`} value={card.headline} maxLength={40} onChange={(e) => update({ cards: ad.cards.map((c, j) => (j === k ? { ...c, headline: e.target.value } : c)) })} />
              {!whatsapp ? <Input placeholder="Link (empty: the ad's link)" value={card.link} onChange={(e) => update({ cards: ad.cards.map((c, j) => (j === k ? { ...c, link: e.target.value } : c)) })} /> : <span />}
              <Button size="small" type="text" danger disabled={ad.cards.length <= 2} icon={<Trash2 size={13} aria-hidden="true" />} onClick={() => update({ cards: ad.cards.filter((_, j) => j !== k) })} aria-label="Remove card" />
            </div>
          ))}
          <Button size="small" className="self-start" icon={<Plus size={13} aria-hidden="true" />} disabled={ad.cards.length >= 10} onClick={() => update({ cards: [...ad.cards, { key: rid() }] })}>
            Add card
          </Button>
        </div>
      )}
      <Form.Item
        label={
          <span className="flex items-center gap-2">
            Primary text
            <Button size="small" type="link" icon={<Sparkles size={13} aria-hidden="true" />} onClick={() => setIdeas(true)}>
              Ideas
            </Button>
          </span>
        }
        className="!mb-0"
        extra={`${(ad.primaryText || "").length} characters — the first 125 show before "See more".`}
      >
        <Input.TextArea rows={3} value={ad.primaryText} maxLength={2200} onChange={(e) => update({ primaryText: e.target.value })} placeholder="What you'd tell a friend about this product, in one or two lines." />
      </Form.Item>
      <div className="grid sm:grid-cols-2 gap-3">
        <Form.Item label="Headline" className="!mb-0" extra={`${(ad.headline || "").length}/40 shows fully on phones`}>
          <Input value={ad.headline} maxLength={255} onChange={(e) => update({ headline: e.target.value })} />
        </Form.Item>
        {advanced && (
          <Form.Item label="Description (optional)" className="!mb-0">
            <Input value={ad.description} maxLength={255} onChange={(e) => update({ description: e.target.value })} />
          </Form.Item>
        )}
      </div>
      {!whatsapp && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Form.Item label="Website link" className="!mb-0" extra="A product or collection page converts better than your home page.">
            <Input value={ad.link} onChange={(e) => update({ link: e.target.value.trim() })} placeholder="https://" />
          </Form.Item>
          <Form.Item label="Button" className="!mb-0">
            <Select value={ad.cta} onChange={(cta) => update({ cta })} options={caps.ctas.filter((c) => c !== "WHATSAPP_MESSAGE").map((c) => ({ value: c, label: c.replace(/_/g, " ").toLowerCase().replace(/^./, (x) => x.toUpperCase()) }))} />
          </Form.Item>
        </div>
      )}
      {whatsapp && <Alert type="info" showIcon message='The button is "Send WhatsApp message" — tapping it opens a chat with your business.' />}
      {(ad.imageHash || ad.videoId || ad.cards.some((c) => c.imageHash)) && ad.identity.pageId && <Previews ad={ad} goal={goal} />}
      <MediaPicker
        open={Boolean(picker)}
        kind={picker?.kind}
        onClose={() => setPicker(null)}
        onPick={(m) => {
          if (picker.target === "main" && picker.kind === "image") update({ imageHash: m.hash, imagePreview: m.previewUrl });
          else if (picker.target === "main") update({ videoId: m.videoId, videoPreview: m.previewUrl });
          else if (picker.target === "thumb") update({ thumbnailHash: m.hash, thumbnailPreview: m.previewUrl });
          else update({ cards: ad.cards.map((c, j) => (j === picker.target ? { ...c, imageHash: m.hash, imagePreview: m.previewUrl } : c)) });
          setPicker(null);
        }}
      />
      <AiIdeas
        open={ideas}
        goal={goal}
        onClose={() => setIdeas(false)}
        onUse={(v) => {
          update({ primaryText: v.primaryText, headline: v.headline, description: v.description || ad.description });
          setIdeas(false);
        }}
      />
    </div>
  );
}

// ── Wizard ────────────────────────────────────────────────────────────

const STEPS = ["Goal", "Budget & schedule", "Audiences", "Ads", "Review"];

export default function Wizard({ open, onClose, draftId: initialDraftId, onPublished, storeUrl }) {
  const { message, modal } = App.useApp();
  const { caps } = useCaps();
  const [step, setStep] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const [spec, setSpec] = useState(null);
  const [draftId, setDraftId] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const [activeSet, setActiveSet] = useState(0);
  const [check, setCheck] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!open || !caps) return;
    setStep(0);
    setCheck(null);
    setPublished(null);
    setActiveSet(0);
    dirty.current = false;
    if (initialDraftId) {
      apiFetch(`/api/meta-ads/drafts/${initialDraftId}`)
        .then(({ draft }) => {
          setSpec(draft.data);
          setDraftId(draft.id);
        })
        .catch((err) => message.error(err.message));
    } else {
      setSpec(blankSpec(caps, storeUrl));
      setDraftId(null);
    }
  }, [open, caps, initialDraftId, storeUrl, message]);

  const set = useCallback((fn) => {
    dirty.current = true;
    setSpec((s) => (typeof fn === "function" ? fn(s) : fn));
  }, []);

  // Autosave, a moment after the last change.
  useEffect(() => {
    if (!open || !spec || !dirty.current) return;
    setSaveState("pending");
    const t = setTimeout(async () => {
      try {
        if (draftId) await apiFetch(`/api/meta-ads/drafts/${draftId}`, { method: "PUT", body: { data: spec } });
        else {
          const { draft } = await apiFetch("/api/meta-ads/drafts", { method: "POST", body: { data: spec } });
          setDraftId(draft.id);
        }
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [spec, open, draftId]);

  const runCheck = useCallback(async () => {
    if (!spec) return null;
    const r = await apiFetch("/api/meta-ads/check", { method: "POST", body: spec }).catch(() => null);
    setCheck(r);
    return r;
  }, [spec]);
  useEffect(() => {
    if (step === 4) runCheck();
  }, [step, runCheck]);

  const counts = useMemo(() => {
    const by = (prefix) => (check?.errors || []).filter((e) => e.at.startsWith(prefix)).length;
    return [by("campaign"), by("campaign"), by("adset") + by("adsets"), by("ad:"), 0];
  }, [check]);

  async function doPublish() {
    const r = await runCheck();
    if (!r?.ok) return message.error("Fix the problems listed first.");
    modal.confirm({
      title: "Publish to Meta?",
      icon: <Rocket size={18} aria-hidden="true" />,
      content: "Oyklane creates the campaign, ad sets and ads in your ad account — all paused. Nothing spends until you turn it on. Meta then reviews each ad (usually within a day).",
      okText: "Publish",
      onOk: async () => {
        setPublishing(true);
        try {
          // Make sure the latest version is saved first.
          if (draftId) await apiFetch(`/api/meta-ads/drafts/${draftId}`, { method: "PUT", body: { data: spec } });
          const id = draftId || (await apiFetch("/api/meta-ads/drafts", { method: "POST", body: { data: spec } })).draft.id;
          setDraftId(id);
          const out = await apiFetch(`/api/meta-ads/drafts/${id}/publish`, { method: "POST", body: { confirm: true } });
          setPublished({ ...out, draftId: id });
          onPublished?.();
        } catch (err) {
          modal.error({ title: "Publishing stopped", content: <div><p>{err.message}</p><p className="text-xs text-ink-muted m-0">Everything created so far is kept (paused). Fix this and publish again — it continues from here without duplicating.</p></div> });
        } finally {
          setPublishing(false);
        }
      },
    });
  }

  async function launch() {
    const total = spec.campaign.budgetLevel === "campaign" ? Number(spec.campaign.budget) : spec.adSets.reduce((n, a) => n + Number(a.budget || 0), 0);
    modal.confirm({
      title: "Turn the campaign on?",
      content: `It can spend up to ${inr(total)} ${spec.campaign.budgetType === "daily" ? "a day" : "in total"}, charged by Meta to your ad account. Ads start once Meta approves them.`,
      okText: "Turn on",
      onOk: async () => {
        try {
          await apiFetch(`/api/meta-ads/drafts/${published.draftId}/launch`, { method: "POST", body: { confirm: true } });
          message.success("Turned on — ads start after Meta's review");
          onClose();
        } catch (err) {
          message.error(err.message);
        }
      },
    });
  }

  if (!open) return null;
  const updateSet = (i, patch) => set((s) => ({ ...s, adSets: s.adSets.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="min(1200px, 100vw)"
      title={
        <div className="flex items-center gap-3 flex-wrap">
          <span>{spec?.campaign?.name || "New campaign"}</span>
          <Tag className="!m-0">{saveState === "saved" ? "Draft saved" : saveState === "pending" ? "Saving…" : saveState === "error" ? "Couldn't save" : "Draft"}</Tag>
        </div>
      }
      extra={<Segmented size="small" value={advanced ? "advanced" : "simple"} onChange={(v) => setAdvanced(v === "advanced")} options={[{ value: "simple", label: "Simple" }, { value: "advanced", label: "Advanced" }]} />}
      destroyOnClose
    >
      {!caps || !spec ? (
        <Spin />
      ) : published ? (
        <div className="max-w-xl mx-auto text-center py-10">
          <CheckCircle2 size={40} className="text-status-success mx-auto" aria-hidden="true" />
          <h3 className="text-lg font-semibold mt-3">Published — paused</h3>
          <p className="text-sm text-ink-muted">
            Created 1 campaign, {published.adSets} ad set{published.adSets === 1 ? "" : "s"} and {published.ads} ad{published.ads === 1 ? "" : "s"} in your ad account. Turn it on when you&apos;re ready; Meta reviews each ad first.
          </p>
          <Space>
            <Button onClick={onClose}>Keep it paused</Button>
            <Button type="primary" icon={<Rocket size={14} aria-hidden="true" />} onClick={launch}>
              Turn on now
            </Button>
          </Space>
        </div>
      ) : (
        <Form layout="vertical" requiredMark={false}>
          <Steps current={step} onChange={setStep} size="small" className="mb-6" items={STEPS.map((title, i) => ({ title, status: i === step ? "process" : counts[i] ? "error" : i < step ? "finish" : "wait" }))} />
          {step === 0 && <GoalStep spec={spec} set={set} caps={caps} advanced={advanced} />}
          {step === 1 && <BudgetStep spec={spec} set={set} caps={caps} advanced={advanced} />}
          {(step === 2 || step === 3) && (
            <div className="grid lg:grid-cols-[220px_1fr] gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted m-0 mb-1">Ad sets</p>
                {spec.adSets.map((a, i) => (
                  <div key={a.key} className={`rounded-md border px-2 py-1.5 cursor-pointer ${i === activeSet ? "border-accent bg-accent-soft" : "border-app-border"}`} onClick={() => setActiveSet(i)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setActiveSet(i)}>
                    <div className="flex justify-between items-center gap-1">
                      <span className="text-sm truncate">{a.name}</span>
                      <span className="flex">
                        <Tooltip title="Duplicate">
                          <Button size="small" type="text" icon={<Copy size={12} aria-hidden="true" />} onClick={(e) => { e.stopPropagation(); set((s) => ({ ...s, adSets: [...s.adSets.slice(0, i + 1), { ...JSON.parse(JSON.stringify(a)), key: rid(), name: `${a.name} copy`, ads: a.ads.map((ad) => ({ ...ad, key: rid() })) }, ...s.adSets.slice(i + 1)] })); }} aria-label="Duplicate ad set" />
                        </Tooltip>
                        <Button size="small" type="text" danger disabled={spec.adSets.length === 1} icon={<Trash2 size={12} aria-hidden="true" />} onClick={(e) => { e.stopPropagation(); set((s) => ({ ...s, adSets: s.adSets.filter((_, j) => j !== i) })); setActiveSet(0); }} aria-label="Remove ad set" />
                      </span>
                    </div>
                    {step === 3 && <span className="text-xs text-ink-muted">{a.ads.length} ad{a.ads.length === 1 ? "" : "s"}</span>}
                  </div>
                ))}
                <Button size="small" icon={<Plus size={13} aria-hidden="true" />} onClick={() => { set((s) => ({ ...s, adSets: [...s.adSets, blankAdSet(caps, s.campaign.objective, storeUrl, s.adSets.length + 1)] })); setActiveSet(spec.adSets.length); }} disabled={spec.adSets.length >= 20}>
                  Add ad set
                </Button>
                <Help>Each ad set is one audience with its own targeting. Test two audiences by giving each its own ad set.</Help>
              </div>
              <div>
                {step === 2 && spec.adSets[activeSet] && <AdSetEditor adSet={spec.adSets[activeSet]} update={(p) => updateSet(activeSet, p)} caps={caps} campaign={spec.campaign} advanced={advanced} />}
                {step === 3 && spec.adSets[activeSet] && (
                  <div className="flex flex-col gap-3">
                    {spec.adSets[activeSet].ads.map((ad, j) => (
                      <Card
                        key={ad.key}
                        size="small"
                        title={ad.name}
                        extra={
                          <Space>
                            <Button size="small" icon={<Copy size={12} aria-hidden="true" />} onClick={() => updateSet(activeSet, { ads: [...spec.adSets[activeSet].ads, { ...JSON.parse(JSON.stringify(ad)), key: rid(), name: `${ad.name} — variation` }] })}>
                              Variation
                            </Button>
                            <Button size="small" danger disabled={spec.adSets[activeSet].ads.length === 1} icon={<Trash2 size={12} aria-hidden="true" />} onClick={() => updateSet(activeSet, { ads: spec.adSets[activeSet].ads.filter((_, k) => k !== j) })} aria-label="Remove ad" />
                          </Space>
                        }
                      >
                        <AdEditor ad={ad} goal={spec.adSets[activeSet].goal} caps={caps} advanced={advanced} update={(p) => updateSet(activeSet, { ads: spec.adSets[activeSet].ads.map((x, k) => (k === j ? { ...x, ...p } : x)) })} />
                      </Card>
                    ))}
                    <Button icon={<Plus size={13} aria-hidden="true" />} onClick={() => updateSet(activeSet, { ads: [...spec.adSets[activeSet].ads, blankAd(caps, storeUrl, spec.adSets[activeSet].ads.length + 1)] })}>
                      Add another ad
                    </Button>
                    <Help>2–4 different ads per ad set lets Meta find the one that works best. Different photos or opening lines make the biggest difference.</Help>
                  </div>
                )}
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="flex flex-col gap-4 max-w-3xl">
              {check === null ? (
                <Spin />
              ) : (
                <>
                  {check.errors.length ? (
                    <Alert type="error" showIcon message={`${check.errors.length} thing${check.errors.length === 1 ? "" : "s"} to fix before publishing`} description={<ul className="m-0 pl-4">{check.errors.map((e, i) => <li key={i}>{e.text}</li>)}</ul>} />
                  ) : (
                    <Alert type="success" showIcon message="Ready to publish" />
                  )}
                  {check.warnings.length > 0 && <Alert type="warning" showIcon icon={<AlertTriangle size={16} aria-hidden="true" />} message="Worth a look" description={<ul className="m-0 pl-4">{check.warnings.map((e, i) => <li key={i}>{e.text}</li>)}</ul>} />}
                </>
              )}
              <Card size="small" title="Summary">
                <p className="m-0 text-sm">
                  <b>{spec.campaign.name || "Untitled"}</b> · {caps.objectives[spec.campaign.objective]?.label} ·{" "}
                  {spec.campaign.budgetLevel === "campaign" ? `${inr(spec.campaign.budget)} ${spec.campaign.budgetType === "daily" ? "a day" : "total"} shared across ad sets` : "budgets per ad set"}
                </p>
                <ul className="text-sm mt-2 mb-0 pl-4">
                  {spec.adSets.map((a) => (
                    <li key={a.key}>
                      {a.name}: {caps.goals[a.goal]?.label}
                      {spec.campaign.budgetLevel === "adset" ? `, ${inr(a.budget)}` : ""} — {a.ads.length} ad{a.ads.length === 1 ? "" : "s"}
                    </li>
                  ))}
                </ul>
              </Card>
              <Help>Every ad links back with tracking (utm_source=facebook and the campaign id), so your store can count orders from these ads separately from Meta&apos;s numbers.</Help>
            </div>
          )}
          <div className="flex justify-between mt-8">
            <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
              Back
            </Button>
            {step < 4 ? (
              <Button type="primary" onClick={() => setStep(step + 1)}>
                Next
              </Button>
            ) : (
              <Button type="primary" icon={<Rocket size={14} aria-hidden="true" />} loading={publishing} disabled={!check?.ok} onClick={doPublish}>
                Publish (paused)
              </Button>
            )}
          </div>
        </Form>
      )}
    </Drawer>
  );
}

