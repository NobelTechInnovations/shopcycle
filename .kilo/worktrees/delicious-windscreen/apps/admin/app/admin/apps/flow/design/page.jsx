"use client";

import { useEffect, useRef, useState } from "react";
import { App, Button, Card, ColorPicker, Segmented, Skeleton, Slider } from "antd";
import { LayoutTemplate, PanelTop, Minus } from "lucide-react";
import { PageHeader, SaveBar } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { ImageUploadField } from "@/components/ImageUploadField";

const SWATCHES = ["#111114", "#5B3FE0", "#0F8B7A", "#C8102E", "#D9480F", "#B8935A", "#1D4ED8", "#BE185D", "#15803D"];

const STYLE_OPTIONS = [
  { value: "classic", label: "Classic", icon: LayoutTemplate, text: "Logo above a white card" },
  { value: "banner", label: "Banner", icon: PanelTop, text: "Logo on a band of your colour" },
  { value: "minimal", label: "Minimal", icon: Minus, text: "Centred, with a thin colour line" },
];

/**
 * Apps ▸ Flow ▸ Email design: the store's logo, colour and layout for
 * every email it sends — order confirmations, shipping updates, sign-in
 * codes and flows. Live preview of two sample emails.
 */
export default function EmailDesignPage() {
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [design, setDesign] = useState(null);
  const [preview, setPreview] = useState(null);
  const [which, setWhich] = useState("order");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    apiFetch("/api/flows/email-design")
      .then((d) => {
        setData(d);
        setDesign(d.design);
        setPreview(d.preview);
        setDirty(!d.saved && Boolean(d.design.logoUrl)); // a logo found in the theme: offer to save it
      })
      .catch((err) => message.error(err.message || "Couldn't load the email design"));
  }, [message]);

  function change(patch) {
    const next = { ...design, ...patch };
    setDesign(next);
    setDirty(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      apiFetch("/api/flows/email-design/preview", { method: "POST", body: { ...next, logoUrl: next.logoUrl || null } })
        .then((d) => setPreview(d.preview))
        .catch(() => {});
    }, 250);
  }

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    try {
      const d = await apiFetch("/api/flows/email-design", { method: "PUT", body: { ...design, logoUrl: design.logoUrl || null } });
      setDesign(d.design);
      setDirty(false);
      message.success("Email design saved — every email your store sends now uses it.");
    } catch (err) {
      message.error(err.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  if (!data || !design) return <Skeleton active paragraph={{ rows: 10 }} />;

  return (
    <form onSubmit={save}>
      <PageHeader title="Email design" backHref="/admin/apps/flow" subtitle="Your logo, colour and layout — used by every email your store sends: order confirmations, shipping updates, sign-in codes and your flows." />

      <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">
        <div className="flex flex-col gap-6">
          <Card size="small" title="Logo">
            <ImageUploadField value={design.logoUrl || ""} onChange={(logoUrl) => change({ logoUrl })} aspect="3 / 1" label="Upload logo" />
            <p className="text-[12px] text-ink-muted mt-2 mb-0">PNG or JPG on a transparent or white background works best. No logo? We show your store's name.</p>
            {data.themeLogo && design.logoUrl !== data.themeLogo && (
              <Button size="small" type="link" className="!px-0 mt-1" onClick={() => change({ logoUrl: data.themeLogo })}>
                Use the logo from your theme
              </Button>
            )}
            {design.logoUrl && (
              <div className="mt-3">
                <p className="text-[12.5px] text-ink m-0">Logo size</p>
                <Slider min={60} max={240} step={10} value={design.logoWidth} onChange={(logoWidth) => change({ logoWidth })} tooltip={{ formatter: (v) => `${v}px` }} />
              </div>
            )}
          </Card>

          <Card size="small" title="Colour">
            <p className="text-[12.5px] text-ink-muted mt-0 mb-2">Buttons, icons and highlights.</p>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use ${c}`}
                  onClick={() => change({ accent: c })}
                  className={`w-7 h-7 rounded-full border-2 cursor-pointer ${design.accent.toLowerCase() === c.toLowerCase() ? "border-accent ring-2 ring-accent/30" : "border-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"}`}
                  style={{ background: c }}
                />
              ))}
              <ColorPicker value={design.accent} onChange={(_, hex) => change({ accent: hex.length === 7 ? hex : design.accent })} disabledAlpha size="small" showText />
            </div>
          </Card>

          <Card size="small" title="Layout">
            <div className="flex flex-col gap-2">
              {STYLE_OPTIONS.map((o) => {
                const Icon = o.icon;
                const on = design.style === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => change({ style: o.value })}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${on ? "border-accent bg-accent-soft/50" : "border-app-border bg-app-surface hover:bg-app-bg"}`}
                  >
                    <span className={`w-8 h-8 rounded-md flex items-center justify-center ${on ? "bg-white text-accent" : "bg-app-bg text-ink-muted"}`}>
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-[13px] font-medium text-ink">{o.label}</span>
                      <span className="block text-[12px] text-ink-muted">{o.text}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        <Card
          size="small"
          title="Preview"
          extra={
            <Segmented
              size="small"
              value={which}
              onChange={setWhich}
              options={[
                { value: "order", label: "Order confirmation" },
                { value: "flow", label: "Flow email" },
              ]}
            />
          }
          styles={{ body: { padding: 0, background: "#F4F4F6" } }}
          className="lg:sticky lg:top-4"
        >
          <iframe title="Email preview" sandbox="allow-same-origin" srcDoc={preview?.[which] || ""} className="w-full h-[760px] border-0 block" />
        </Card>
      </div>

      <SaveBar dirty={dirty} saving={saving} saveLabel="Save design" onDiscard={() => window.location.reload()} />
    </form>
  );
}
