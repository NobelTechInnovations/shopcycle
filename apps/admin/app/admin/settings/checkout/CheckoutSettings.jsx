"use client";

import { useState } from "react";
import { Card, Segmented, Button, App, Alert } from "antd";
import { Lock } from "lucide-react";
import { apiFetch } from "@/lib/api";

const THREE = [
  { value: "hidden", label: "Hidden" },
  { value: "optional", label: "Optional" },
  { value: "required", label: "Required" },
];
const TWO = [
  { value: "hidden", label: "Hidden" },
  { value: "optional", label: "Optional" },
];

const GROUPS = [
  {
    title: "Contact",
    rows: [
      { key: "email", label: "Email", hint: "Order confirmation and shipping updates go here.", fixed: "Always required" },
      { key: "phone", label: "Mobile number", hint: "For the courier, and for cash-on-delivery confirmation calls.", options: THREE },
      {
        key: "marketing",
        label: "“Email me offers” checkbox",
        hint: "Always unticked — shoppers opt in themselves.",
        options: [
          { value: "hidden", label: "Hidden" },
          { value: "unchecked", label: "Shown" },
        ],
      },
    ],
  },
  {
    title: "Delivery address",
    rows: [
      { key: "name", label: "Full name, address, city, state, PIN code", hint: "Needed to deliver the order.", fixed: "Always required" },
      { key: "address2", label: "Apartment, landmark", hint: "A second address line.", options: THREE },
      {
        key: "country",
        label: "Country",
        hint: "Ship within India only to leave the country menu out.",
        options: [
          { value: "india", label: "India only" },
          { value: "show", label: "Show menu" },
        ],
      },
    ],
  },
  {
    title: "Business buyers and notes",
    rows: [
      { key: "company", label: "Company name", hint: "Shown on the order and the GST invoice.", options: THREE },
      { key: "gstin", label: "GSTIN", hint: "Checked for the right format and printed on the GST invoice.", options: TWO },
      { key: "note", label: "Order note", hint: "Delivery instructions or a gift message, shown on the order.", options: TWO },
    ],
  },
];

function Field({ label, optional, wide }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <p className="m-0 mb-1 text-[10.5px] font-medium text-ink-muted">
        {label}
        {optional && <span className="font-normal"> (optional)</span>}
      </p>
      <div className="h-7 rounded-md border border-app-border bg-app-surface" />
    </div>
  );
}

/** A small picture of the checkout form with the current choices. */
function Preview({ v, storeName }) {
  const show = (k) => v[k] !== "hidden";
  const opt = (k) => v[k] === "optional";
  return (
    <div className="rounded-xl border border-app-border bg-app-bg p-4" aria-label="Checkout form preview">
      <p className="m-0 mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink-subtle">Preview</p>
      <div className="rounded-lg bg-app-surface border border-app-border p-4 flex flex-col gap-4">
        <div>
          <p className="m-0 mb-2 text-[13px] font-semibold text-ink">Contact</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Email" wide={!show("phone")} />
            {show("phone") && <Field label="Mobile number" optional={opt("phone")} />}
          </div>
          {v.marketing !== "hidden" && (
            <p className="m-0 mt-2 flex items-center gap-1.5 text-[10.5px] text-ink-muted">
              <span className="inline-block w-3 h-3 rounded-[3px] border border-app-border bg-app-surface" /> Email me news and offers from {storeName}
            </p>
          )}
        </div>
        <div>
          <p className="m-0 mb-2 text-[13px] font-semibold text-ink">Delivery</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Full name" wide />
            <Field label="Address" wide />
            {show("address2") && <Field label="Apartment, landmark" optional={opt("address2")} wide />}
            <Field label="City" />
            <Field label="PIN code" />
            {v.country === "show" && <Field label="Country" wide />}
            {show("company") && <Field label="Company name" optional={opt("company")} wide={!show("gstin")} />}
            {show("gstin") && <Field label="GSTIN" optional wide={!show("company")} />}
            {show("note") && <Field label="Order note" optional wide />}
          </div>
        </div>
        <div className="h-8 rounded-md bg-ink flex items-center justify-center gap-1.5 text-[11px] font-medium text-white">
          <Lock size={11} aria-hidden="true" /> Place order
        </div>
      </div>
    </div>
  );
}

export function CheckoutSettings({ initial, storeName, canEdit }) {
  const { message } = App.useApp();
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  async function save() {
    setSaving(true);
    try {
      const { email, name, ...checkout } = values;
      await apiFetch("/api/store", { method: "PATCH", body: { settings: { checkout } } });
      setSaved(values);
      message.success("Checkout saved — the form updates straight away");
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
      <div className="flex flex-col gap-4 min-w-0">
        {!canEdit && <Alert type="info" showIcon message="Only the store owner or an admin can change checkout." />}
        {GROUPS.map((g) => (
          <Card key={g.title} size="small" title={g.title}>
            <ul className="m-0 p-0 list-none divide-y divide-app-border">
              {g.rows.map((r) => (
                <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="m-0 text-sm font-medium text-ink">{r.label}</p>
                    <p className="m-0 mt-0.5 text-[13px] text-ink-muted">{r.hint}</p>
                  </div>
                  {r.fixed ? (
                    <span className="text-xs text-ink-muted">{r.fixed}</span>
                  ) : (
                    <Segmented
                      size="small"
                      disabled={!canEdit}
                      value={values[r.key]}
                      options={r.options}
                      onChange={(v) => setValues((cur) => ({ ...cur, [r.key]: v }))}
                      aria-label={r.label}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
        {canEdit && (
          <div className="flex justify-end gap-2">
            <Button disabled={!dirty} onClick={() => setValues(saved)}>
              Discard
            </Button>
            <Button type="primary" disabled={!dirty} loading={saving} onClick={save}>
              Save
            </Button>
          </div>
        )}
      </div>
      <div className="xl:sticky xl:top-4">
        <Preview v={values} storeName={storeName} />
      </div>
    </div>
  );
}
