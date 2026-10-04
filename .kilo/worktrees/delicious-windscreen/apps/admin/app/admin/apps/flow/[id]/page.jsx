"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Dropdown, Input, InputNumber, Modal, Radio, Segmented, Select, Skeleton, Switch, Tag, Tooltip } from "antd";
import { ArrowDown, ArrowUp, Braces, ChevronDown, Flag, MoreHorizontal, Plus, Send, Trash2, X } from "lucide-react";
import { PageHeader, SaveBar, EmptyState, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { StepIcon, TriggerIcon, stepSummary, stepTitle, stepShort, stepHeadline, newStep, relative } from "../flow-ui";
import { ImageUploadField } from "@/components/ImageUploadField";

const STATUS_TAG = {
  running: { color: "processing", label: "Running" },
  waiting: { color: "gold", label: "Waiting" },
  done: { color: "success", label: "Finished" },
  stopped: { color: "default", label: "Stopped" },
  failed: { color: "error", label: "Failed" },
};
const RESULT_LABEL = { passed: "Condition met", not_met: "Condition not met — stopped", sent: "Sent", skipped: "Skipped", failed: "Failed", waiting: "Waited", stopped: "Stopped" };

// ── Canvas ────────────────────────────────────────────────────────────

function AddStep({ catalog, onAdd, compact }) {
  const items = Object.entries(catalog.stepTypes).map(([type, t]) => ({
    key: type,
    label: (
      <div className="flex items-center gap-2.5 py-1">
        <StepIcon type={type} size={14} className="!w-7 !h-7" />
        <div>
          <div className="text-[13.5px] text-ink">{t.label}</div>
          <div className="text-[12px] text-ink-muted max-w-[240px] whitespace-normal">{t.hint}</div>
        </div>
      </div>
    ),
    onClick: () => onAdd(type),
  }));
  return (
    <div className="flex flex-col items-center" aria-hidden={false}>
      <span className="w-px h-4 bg-[#D7D7DE]" aria-hidden="true" />
      <Dropdown menu={{ items }} trigger={["click"]} placement="bottom">
        <button
          type="button"
          aria-label="Add a step here"
          className={`group flex items-center justify-center gap-1 rounded-full border border-dashed border-[#C9C9D1] bg-app-surface text-ink-muted cursor-pointer hover:border-accent hover:text-accent transition-colors ${compact ? "w-7 h-7" : "h-8 px-3 text-[12.5px]"}`}
        >
          <Plus size={14} aria-hidden="true" />
          {!compact && "Add step"}
        </button>
      </Dropdown>
      <span className="w-px h-4 bg-[#D7D7DE]" aria-hidden="true" />
    </div>
  );
}

function Node({ selected, onSelect, icon, eyebrow, title, summary, tools, invalid }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect())}
      aria-pressed={selected}
      className={`group relative w-full max-w-[460px] mx-auto flex items-start gap-3 rounded-[14px] border bg-app-surface px-4 py-3.5 cursor-pointer text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        selected ? "border-accent shadow-raised ring-4 ring-accent/10" : invalid ? "border-status-danger/50 shadow-card" : "border-app-border shadow-card hover:border-[#CFCFD6]"
      }`}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-subtle truncate pr-20">{eyebrow}</div>
        <div className="text-[14px] font-medium text-ink mt-0.5 leading-snug line-clamp-2 break-words">{title}</div>
        {summary && <div className="text-[12.5px] text-ink-muted mt-0.5 leading-snug line-clamp-2">{summary}</div>}
      </div>
      {tools && (
        <div
          className={`absolute top-2 right-2 flex items-center gap-0.5 rounded-lg bg-app-surface/90 backdrop-blur-sm transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {tools}
        </div>
      )}
    </div>
  );
}

const toolBtn = "w-7 h-7 rounded-md flex items-center justify-center bg-transparent border-0 cursor-pointer text-ink-muted hover:text-ink hover:bg-app-bg disabled:opacity-30 disabled:cursor-default";

function Canvas({ draft, catalog, selected, setSelected, update }) {
  const steps = draft.steps;
  const add = (index, type) => {
    const step = newStep(type, catalog, draft.trigger);
    const next = [...steps];
    next.splice(index, 0, step);
    update({ steps: next });
    setSelected(step.id);
  };
  const move = (i, dir) => {
    const next = [...steps];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    update({ steps: next });
  };
  const remove = (i) => {
    const next = steps.filter((_, j) => j !== i);
    update({ steps: next });
    setSelected("trigger");
  };
  const invalid = (s) => (s.type === "send_email" && (!s.subject?.trim() || !s.body?.trim())) || (s.type === "condition" && !(s.rules || []).length) || (s.type === "notify_owner" && !s.subject?.trim());

  return (
    <div className="rounded-[16px] border border-app-border px-3 sm:px-4 py-6 sm:py-8" style={{ backgroundColor: "#FAFAFB", backgroundImage: "radial-gradient(#E4E4E9 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
      <Node
        selected={selected === "trigger"}
        onSelect={() => setSelected("trigger")}
        icon={<TriggerIcon trigger={draft.trigger} />}
        eyebrow="When"
        title={catalog.triggers[draft.trigger]?.label}
        summary={catalog.triggers[draft.trigger]?.hint}
      />
      {steps.map((s, i) => (
        <div key={s.id}>
          <AddStep catalog={catalog} compact onAdd={(type) => add(i, type)} />
          <Node
            selected={selected === s.id}
            onSelect={() => setSelected(s.id)}
            icon={<StepIcon type={s.type} />}
            eyebrow={`Step ${i + 1} · ${stepShort(s)}`}
            title={stepHeadline(s, catalog)}
            invalid={invalid(s)}
            tools={
              <>
                <Tooltip title="Move up">
                  <button type="button" className={toolBtn} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move step up">
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                </Tooltip>
                <Tooltip title="Move down">
                  <button type="button" className={toolBtn} disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Move step down">
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                </Tooltip>
                <Tooltip title="Remove">
                  <button type="button" className={`${toolBtn} hover:!text-status-danger`} onClick={() => remove(i)} aria-label="Remove step">
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </Tooltip>
              </>
            }
          />
        </div>
      ))}
      <AddStep catalog={catalog} onAdd={(type) => add(steps.length, type)} />
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-subtle bg-app-surface border border-app-border rounded-full px-3 py-1">
          <Flag size={12} aria-hidden="true" /> End
        </span>
      </div>
    </div>
  );
}

// ── Inspector ─────────────────────────────────────────────────────────

function Field({ label, hint, children }) {
  return (
    <label className="block mb-4">
      <span className="block text-[13px] font-medium text-ink mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-ink-muted mt-1">{hint}</span>}
    </label>
  );
}

function Placeholders({ catalog, subject, onPick }) {
  const items = catalog.variables
    .filter((v) => v.subjects.includes(subject))
    .map((v) => ({ key: v.key, label: <span className="text-[13px]">{v.label} <code className="text-[11px] text-ink-subtle">{`{{${v.key}}}`}</code></span>, onClick: () => onPick(`{{${v.key}}}`) }));
  return (
    <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
      <Button size="small" type="text" icon={<Braces size={13} aria-hidden="true" />} className="!text-ink-muted">
        Insert <ChevronDown size={12} aria-hidden="true" />
      </Button>
    </Dropdown>
  );
}

function TriggerForm({ draft, catalog, onChange }) {
  return (
    <div>
      <p className="text-[13px] text-ink-muted mt-0 mb-3">What starts this flow. It runs once for each order, customer or checkout.</p>
      <Radio.Group value={draft.trigger} onChange={(e) => onChange(e.target.value)} className="!flex flex-col gap-2 w-full">
        {Object.entries(catalog.triggers).map(([key, t]) => (
          <Radio key={key} value={key} className={`!m-0 !items-start rounded-[10px] border px-3 py-2.5 ${draft.trigger === key ? "border-accent bg-accent-soft/50" : "border-app-border"}`}>
            <span className="block text-[13.5px] text-ink">{t.label}</span>
            <span className="block text-[12px] text-ink-muted">{t.hint}</span>
          </Radio>
        ))}
      </Radio.Group>
    </div>
  );
}

function WaitForm({ step, set }) {
  return (
    <Field label="Wait for" hint="Up to 90 days. The next step runs after this.">
      <div className="flex gap-2">
        <InputNumber min={1} max={step.unit === "minutes" ? 129600 : step.unit === "hours" ? 2160 : 90} value={step.amount} onChange={(v) => set({ amount: v || 1 })} className="!w-28" aria-label="Amount" />
        <Select
          value={step.unit}
          onChange={(unit) => set({ unit })}
          className="flex-1"
          aria-label="Unit"
          options={[
            { value: "minutes", label: "minutes" },
            { value: "hours", label: "hours" },
            { value: "days", label: "days" },
          ]}
        />
      </div>
    </Field>
  );
}

function RuleRow({ rule, fields, catalog, onChange, onRemove }) {
  const def = catalog.fields[rule.field];
  const ops = def ? catalog.ops[def.type] : [];
  const setField = (field) => {
    const d = catalog.fields[field];
    onChange({ field, op: catalog.ops[d.type][0].value, value: d.type === "number" ? 0 : d.type === "choice" ? d.options[0].value : d.type === "text" ? "" : null });
  };
  return (
    <div className="rounded-[10px] border border-app-border bg-app-bg/50 p-2.5 flex flex-col gap-2">
      <div className="flex gap-2">
        <Select value={rule.field} onChange={setField} className="flex-1 min-w-0" options={fields.map(([key, f]) => ({ value: key, label: f.label }))} aria-label="Field" showSearch optionFilterProp="label" />
        <button type="button" onClick={onRemove} className={toolBtn} aria-label="Remove condition">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {def && (
        <div className="flex gap-2">
          <Select value={rule.op} onChange={(op) => onChange({ ...rule, op })} className={def.type === "boolean" || ["is_empty", "not_empty"].includes(rule.op) ? "flex-1" : "w-[150px]"} options={ops} aria-label="Comparison" />
          {def.type === "number" && <InputNumber value={rule.value} onChange={(v) => onChange({ ...rule, value: v ?? 0 })} className="flex-1" aria-label="Value" />}
          {def.type === "choice" && <Select value={rule.value} onChange={(v) => onChange({ ...rule, value: v })} className="flex-1" options={def.options} aria-label="Value" />}
          {def.type === "text" && !["is_empty", "not_empty"].includes(rule.op) && <Input value={rule.value} onChange={(e) => onChange({ ...rule, value: e.target.value })} className="flex-1" placeholder="Text" aria-label="Value" />}
        </div>
      )}
    </div>
  );
}

function ConditionForm({ step, set, catalog, subject }) {
  const fields = Object.entries(catalog.fields).filter(([, f]) => f.subjects.includes(subject));
  const rules = step.rules || [];
  const setRule = (i, r) => set({ rules: rules.map((x, j) => (j === i ? r : x)) });
  return (
    <div>
      <p className="text-[13px] text-ink-muted mt-0 mb-3">If this isn't true, the flow stops here for that {subject === "cart" ? "checkout" : subject}.</p>
      <Field label="Carry on when">
        <Segmented
          value={step.match}
          onChange={(match) => set({ match })}
          options={[
            { value: "all", label: "All are true" },
            { value: "any", label: "Any is true" },
          ]}
        />
      </Field>
      <div className="flex flex-col gap-2 mb-3">
        {rules.map((r, i) => (
          <RuleRow key={i} rule={r} fields={fields} catalog={catalog} onChange={(nr) => setRule(i, nr)} onRemove={() => set({ rules: rules.filter((_, j) => j !== i) })} />
        ))}
      </div>
      <Button
        size="small"
        icon={<Plus size={13} aria-hidden="true" />}
        disabled={rules.length >= 10}
        onClick={() => {
          const [field, d] = fields[0];
          set({ rules: [...rules, { field, op: catalog.ops[d.type][0].value, value: d.type === "number" ? 0 : d.type === "choice" ? d.options[0].value : d.type === "text" ? "" : null }] });
        }}
      >
        Add condition
      </Button>
    </div>
  );
}

function usePreview(trigger, step) {
  const [preview, setPreview] = useState(null);
  const key = JSON.stringify(step);
  useEffect(() => {
    if (!step || !["send_email", "notify_owner"].includes(step.type)) return undefined;
    const t = setTimeout(async () => {
      try {
        setPreview(await apiFetch("/api/flows/preview", { method: "POST", body: { trigger, step } }));
      } catch (err) {
        setPreview({ error: err.message });
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, key]);
  return preview;
}

function Preview({ trigger, step }) {
  const preview = usePreview(trigger, step);
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-medium text-ink">Preview</span>
        <span className="text-[12px] text-ink-subtle">With sample values</span>
      </div>
      <div className="rounded-[12px] border border-app-border overflow-hidden bg-[#F4F4F6]">
        {preview?.error ? (
          <p className="text-[12.5px] text-ink-muted p-4 m-0">{preview.error}</p>
        ) : preview ? (
          <>
            <div className="px-3 py-2 bg-app-surface border-b border-app-border text-[12.5px] truncate">
              <span className="text-ink-subtle">Subject:</span> <span className="text-ink font-medium">{preview.subject}</span>
            </div>
            <iframe title="Email preview" sandbox="allow-same-origin" srcDoc={preview.html} className="w-full h-[460px] border-0 bg-white block" />
          </>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-[12.5px] text-ink-subtle">Rendering…</div>
        )}
      </div>
    </div>
  );
}

/** The email's look: a picture at the top and an optional banner. Logo,
 * colour and layout are the store's (Email design). */
function EmailDesignFields({ step, set, catalog }) {
  const [open, setOpen] = useState(Boolean(step.icon || step.banner));
  return (
    <div className="rounded-[10px] border border-app-border mb-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-transparent border-0 cursor-pointer text-left">
        <span>
          <span className="block text-[13px] text-ink font-medium">Design</span>
          <span className="block text-[12px] text-ink-muted">
            {step.icon || step.banner ? [step.icon && "Icon", step.banner && "Banner image"].filter(Boolean).join(" + ") : "Add an icon or a banner image"}
          </span>
        </span>
        <span className="text-[12px] text-accent">{open ? "Hide" : "Edit"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-app-border pt-3">
          <p className="text-[12.5px] text-ink m-0 mb-2">Icon at the top</p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            <button
              type="button"
              onClick={() => set({ icon: "" })}
              className={`h-10 px-3 rounded-lg border text-[12px] cursor-pointer ${!step.icon ? "border-accent bg-accent-soft/50 text-ink" : "border-app-border bg-app-surface text-ink-muted"}`}
            >
              None
            </button>
            {(catalog.icons || []).map((i) => (
              <button
                key={i.key}
                type="button"
                title={i.key}
                aria-label={`Icon: ${i.key}`}
                onClick={() => set({ icon: i.key })}
                className={`w-10 h-10 rounded-lg border flex items-center justify-center cursor-pointer ${step.icon === i.key ? "border-accent bg-accent-soft/50" : "border-app-border bg-app-surface hover:bg-app-bg"}`}
              >
                <img src={i.url} alt="" width={20} height={20} />
              </button>
            ))}
          </div>
          <p className="text-[12.5px] text-ink m-0 mb-2">Banner image (optional)</p>
          <ImageUploadField value={step.banner || ""} onChange={(banner) => set({ banner })} aspect="2 / 1" label="Upload banner" />
          <p className="text-[12px] text-ink-muted mt-2 mb-0">
            Wide images (about 1200 × 600) look best. Your logo, colour and layout are set in{" "}
            <Link href="/admin/apps/flow/design" className="text-accent">
              Email design
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}

function EmailForm({ step, set, catalog, subject, trigger }) {
  const bodyRef = useRef(null);
  const insertBody = (token) => {
    const el = bodyRef.current?.resizableTextArea?.textArea;
    const at = el && typeof el.selectionStart === "number" ? el.selectionStart : (step.body || "").length;
    const body = `${(step.body || "").slice(0, at)}${token}${(step.body || "").slice(at)}`;
    set({ body });
    requestAnimationFrame(() => el?.focus());
  };
  const links = Object.entries(catalog.links).filter(([, l]) => l.subjects.includes(subject));
  return (
    <div>
      <Field label={<span className="flex items-center justify-between">Subject <Placeholders catalog={catalog} subject={subject} onPick={(t) => set({ subject: `${step.subject || ""}${t}` })} /></span>}>
        <Input value={step.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={200} placeholder="Thanks for your order, {{customer.first_name}}!" />
      </Field>
      <Field label="Heading" hint="The big line at the top of the email. Optional.">
        <Input value={step.heading} onChange={(e) => set({ heading: e.target.value })} maxLength={200} />
      </Field>
      <Field label={<span className="flex items-center justify-between">Message <Placeholders catalog={catalog} subject={subject} onPick={insertBody} /></span>} hint="A blank line starts a new paragraph. {{discount_code}} shows the code below.">
        <Input.TextArea ref={bodyRef} value={step.body} onChange={(e) => set({ body: e.target.value })} autoSize={{ minRows: 5, maxRows: 14 }} maxLength={5000} />
      </Field>
      <Field label="Discount code" hint="Create it first in Discounts — this only shows it in the email.">
        <Input value={step.discountCode} onChange={(e) => set({ discountCode: e.target.value.toUpperCase().replace(/\s/g, "") })} maxLength={40} placeholder="e.g. THANKYOU10" />
      </Field>
      <Field label="Button">
        <Select
          value={step.buttonLink || ""}
          onChange={(buttonLink) => set({ buttonLink, buttonLabel: buttonLink && !step.buttonLabel ? "Shop now" : step.buttonLabel })}
          className="w-full"
          options={[{ value: "", label: "No button" }, ...links.map(([value, l]) => ({ value, label: l.label }))]}
        />
      </Field>
      {step.buttonLink && (
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2 -mt-1">
          <Field label="Button text">
            <Input value={step.buttonLabel} onChange={(e) => set({ buttonLabel: e.target.value })} maxLength={60} />
          </Field>
          {step.buttonLink === "custom" && (
            <Field label="Link">
              <Input value={step.buttonUrl} onChange={(e) => set({ buttonUrl: e.target.value })} placeholder="https://" />
            </Field>
          )}
        </div>
      )}
      <EmailDesignFields step={step} set={set} catalog={catalog} />
      {subject !== "customer" && (
        <label className="flex items-center justify-between gap-3 rounded-[10px] border border-app-border px-3 py-2.5 cursor-pointer">
          <span>
            <span className="block text-[13px] text-ink">Include the {subject === "cart" ? "cart" : "order"} summary</span>
            <span className="block text-[12px] text-ink-muted">Items, quantities and total under the message.</span>
          </span>
          <Switch size="small" checked={Boolean(step.includeSummary)} onChange={(includeSummary) => set({ includeSummary })} />
        </label>
      )}
      <Preview trigger={trigger} step={step} />
    </div>
  );
}

function OwnerForm({ step, set, catalog, subject, trigger }) {
  return (
    <div>
      <p className="text-[13px] text-ink-muted mt-0 mb-3">Goes to your login email and your store's support email.</p>
      <Field label={<span className="flex items-center justify-between">Subject <Placeholders catalog={catalog} subject={subject} onPick={(t) => set({ subject: `${step.subject || ""}${t}` })} /></span>}>
        <Input value={step.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={200} />
      </Field>
      <Field label={<span className="flex items-center justify-between">Note <Placeholders catalog={catalog} subject={subject} onPick={(t) => set({ body: `${step.body || ""}${t}` })} /></span>}>
        <Input.TextArea value={step.body} onChange={(e) => set({ body: e.target.value })} autoSize={{ minRows: 4, maxRows: 10 }} maxLength={3000} />
      </Field>
      <Preview trigger={trigger} step={step} />
    </div>
  );
}

function Inspector({ draft, catalog, selected, update, changeTrigger }) {
  const subject = catalog.triggers[draft.trigger]?.subject;
  if (selected === "trigger") {
    return (
      <InspectorShell icon={<TriggerIcon trigger={draft.trigger} />} title="Trigger">
        <TriggerForm draft={draft} catalog={catalog} onChange={changeTrigger} />
      </InspectorShell>
    );
  }
  const index = draft.steps.findIndex((s) => s.id === selected);
  const step = draft.steps[index];
  if (!step) return <InspectorShell title="Select a step">Click a step on the left to edit it.</InspectorShell>;
  const set = (patch) => update({ steps: draft.steps.map((s) => (s.id === step.id ? { ...s, ...patch } : s)) });
  const props = { step, set, catalog, subject, trigger: draft.trigger };
  return (
    <InspectorShell icon={<StepIcon type={step.type} />} title={`Step ${index + 1} · ${stepTitle(step, catalog)}`} hint={catalog.stepTypes[step.type]?.hint}>
      {step.type === "wait" && <WaitForm {...props} />}
      {step.type === "condition" && <ConditionForm {...props} />}
      {step.type === "send_email" && <EmailForm {...props} />}
      {step.type === "notify_owner" && <OwnerForm {...props} />}
    </InspectorShell>
  );
}

function InspectorShell({ icon, title, hint, children }) {
  return (
    <aside className="bg-app-surface border border-app-border rounded-[16px] shadow-card p-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto">
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-app-border">
        {icon}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink m-0">{title}</h2>
          {hint && <p className="text-[12.5px] text-ink-muted m-0">{hint}</p>}
        </div>
      </div>
      {children}
    </aside>
  );
}

// ── Activity ──────────────────────────────────────────────────────────

function Activity({ runs, flow, catalog }) {
  const [open, setOpen] = useState(null);
  if (!runs.length) {
    return <EmptyState title="No runs yet" description={flow.enabled ? "Runs appear here the next time the trigger happens." : "Turn the flow on and runs will appear here."} />;
  }
  const byId = Object.fromEntries(flow.steps.map((s, i) => [s.id, { s, i }]));
  return (
    <ul className="list-none m-0 p-0 bg-app-surface border border-app-border rounded-[14px] shadow-card divide-y divide-app-border overflow-hidden">
      {runs.map((run) => {
        const tag = STATUS_TAG[run.status] || STATUS_TAG.done;
        const expanded = open === run.id;
        return (
          <li key={run.id}>
            <button type="button" onClick={() => setOpen(expanded ? null : run.id)} aria-expanded={expanded} className="w-full flex items-center gap-3 px-4 py-3 bg-transparent border-0 cursor-pointer text-left hover:bg-app-bg/60">
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] text-ink font-medium truncate">{run.subject.title}</div>
                <div className="text-[12px] text-ink-muted truncate">{run.subject.detail}</div>
              </div>
              {run.status === "waiting" && run.nextRunAt && <span className="hidden sm:inline text-[12px] text-ink-muted">Next step {new Date(run.nextRunAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>}
              <Tag color={tag.color} className="!m-0">{tag.label}</Tag>
              <span className="text-[12px] text-ink-subtle w-20 text-right">{relative(run.createdAt)}</span>
              <ChevronDown size={14} className={`text-ink-subtle transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {expanded && (
              <div className="px-4 pb-4">
                <ol className="list-none m-0 p-0 border-l-2 border-app-border ml-2 pl-4 flex flex-col gap-2.5">
                  {(run.log || []).map((e, i) => {
                    const hit = byId[e.stepId];
                    return (
                      <li key={i} className="relative text-[12.5px]">
                        <span className={`absolute -left-[23px] top-1 w-3 h-3 rounded-full border-2 border-white ${e.result === "failed" ? "bg-status-danger" : e.result === "not_met" ? "bg-ink-subtle" : "bg-accent"}`} aria-hidden="true" />
                        <span className="text-ink">{hit ? `Step ${hit.i + 1}: ${stepSummary(hit.s, catalog)}` : e.type === "run" ? "Run" : "A step since removed"}</span>
                        <span className="text-ink-muted"> — {RESULT_LABEL[e.result] || e.result}{e.detail ? ` · ${e.detail}` : ""}</span>
                        <span className="block text-[11.5px] text-ink-subtle">{new Date(e.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                      </li>
                    );
                  })}
                </ol>
                {run.error && <p className="text-[12.5px] text-ink-muted mt-3 mb-0">{run.error}</p>}
                {run.subject.href && (
                  <Link href={run.subject.href} className="inline-block mt-3 text-[12.5px] text-ink font-medium">
                    Open {run.subject.title.startsWith("Order") ? "order" : run.subject.title.startsWith("Checkout") ? "abandoned checkouts" : "customer"} →
                  </Link>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

const pick = (f) => ({ name: f.name, trigger: f.trigger, steps: f.steps });

export default function FlowEditorPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [selected, setSelected] = useState("trigger");
  const [tab, setTab] = useState("editor");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiFetch(`/api/flows/${id}`);
      setData(d);
      setDraft((cur) => cur || pick(d.flow));
    } catch (err) {
      if (err.status === 404 || err.status === 402) setMissing(true);
      else message.error(err.message);
    }
  }, [id, message]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => data && draft && JSON.stringify(pick(data.flow)) !== JSON.stringify(draft), [data, draft]);

  if (missing) return <EmptyState title="Flow not found" description="It may have been deleted, or the Flow app isn't installed." actionLabel="Back to Flow" onAction={() => router.push("/admin/apps/flow")} />;
  if (!data || !draft) return <Skeleton active paragraph={{ rows: 10 }} />;
  const { flow, runs, catalog } = data;

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));
  function changeTrigger(trigger) {
    const subject = catalog.triggers[trigger].subject;
    const steps = draft.steps.map((s) => {
      if (s.type === "condition") return { ...s, rules: (s.rules || []).filter((r) => catalog.fields[r.field]?.subjects.includes(subject)) };
      if (s.type === "send_email") {
        const ok = !s.buttonLink || catalog.links[s.buttonLink]?.subjects.includes(subject);
        return { ...s, buttonLink: ok ? s.buttonLink : "store", includeSummary: subject === "customer" ? false : s.includeSummary };
      }
      return s;
    });
    update({ trigger, steps });
  }

  async function save(extra = {}) {
    setSaving(true);
    try {
      const { flow: saved } = await apiFetch(`/api/flows/${id}`, { method: "PATCH", body: { ...draft, ...extra } });
      setData((d) => ({ ...d, flow: saved }));
      setDraft(pick(saved));
      message.success(extra.enabled === undefined ? "Flow saved" : extra.enabled ? "Flow saved and turned on" : "Flow turned off");
      return true;
    } catch (err) {
      message.error(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    try {
      const r = await apiFetch(`/api/flows/${id}/test`, { method: "POST", body: { to: testTo } });
      message.success(`${r.sent} test email${r.sent === 1 ? "" : "s"} sent to ${r.to}`);
      setTesting(false);
    } catch (err) {
      message.error(err.message);
    }
  }

  function remove() {
    confirmDialog({
      title: `Delete “${flow.name}”?`,
      description: "It stops straight away, including runs that are waiting.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/flows/${id}`, { method: "DELETE" });
        router.push("/admin/apps/flow");
      },
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <PageHeader
        backHref="/admin/apps/flow"
        title={
          <Input
            variant="borderless"
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            maxLength={120}
            aria-label="Flow name"
            className="!p-0 !text-[22px] !font-semibold !text-ink hover:!bg-app-bg focus:!bg-app-surface !rounded-md"
            style={{ letterSpacing: "-0.02em", width: `${Math.max(12, draft.name.length + 2)}ch`, maxWidth: "100%" }}
          />
        }
        meta={
          <label className="inline-flex items-center gap-2 text-[13px] text-ink-muted ml-1">
            <Switch
              size="small"
              checked={flow.enabled}
              loading={saving}
              onChange={(enabled) => save({ enabled })}
              aria-label={flow.enabled ? "Turn flow off" : "Turn flow on"}
            />
            {flow.enabled ? <span className="text-status-success font-medium">On</span> : "Off"}
          </label>
        }
        subtitle={`${flow.runsCount} run${flow.runsCount === 1 ? "" : "s"} · ${flow.emailsSent} email${flow.emailsSent === 1 ? "" : "s"} sent · last run ${relative(flow.lastRunAt).toLowerCase()}`}
        actions={
          <>
            <Button icon={<Send size={14} aria-hidden="true" />} onClick={() => setTesting(true)} disabled={!draft.steps.some((s) => s.type === "send_email" || s.type === "notify_owner")}>
              Send test
            </Button>
            <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items: [{ key: "delete", danger: true, icon: <Trash2 size={14} aria-hidden="true" />, label: "Delete flow", onClick: remove }] }}>
              <Button icon={<MoreHorizontal size={16} aria-hidden="true" />} aria-label="More actions" />
            </Dropdown>
          </>
        }
      />

      <Segmented
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: "editor", label: "Editor" },
          { value: "activity", label: `Activity${runs.length ? ` · ${runs.length}` : ""}` },
        ]}
      />

      {tab === "editor" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)] items-start">
          <Canvas draft={draft} catalog={catalog} selected={selected} setSelected={setSelected} update={update} />
          <Inspector draft={draft} catalog={catalog} selected={selected} update={update} changeTrigger={changeTrigger} />
        </div>
      ) : (
        <Activity runs={runs} flow={flow} catalog={catalog} />
      )}

      <SaveBar dirty={Boolean(dirty)} saving={saving} onDiscard={() => setDraft(pick(flow))} />

      <Modal title="Send a test" open={testing} onCancel={() => setTesting(false)} onOk={sendTest} okText="Send" destroyOnHidden>
        <p className="text-[13px] text-ink-muted">Every email in this flow's saved version, with sample values, “[Test]” in the subject.{dirty ? " Save first to test your latest changes." : ""}</p>
        <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@yourbrand.com" autoFocus onPressEnter={sendTest} aria-label="Send the test to" />
      </Modal>
    </form>
  );
}
