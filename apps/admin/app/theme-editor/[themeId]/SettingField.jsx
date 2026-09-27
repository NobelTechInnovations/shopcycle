"use client";

import { useEffect, useState } from "react";
import { Input, InputNumber, Select, Slider, Switch, ColorPicker, Upload, Button, App } from "antd";
import { Upload as UploadIcon, X, Images } from "lucide-react";
import { IMAGE_ACCEPT, uploadImage } from "@/lib/uploads";
import { MediaLibraryModal } from "@/components/MediaLibraryModal";

// Google Fonts that read well for Indian storefronts (Latin + good
// numerals for ₹ prices). Sans first, then serif/display.
const FONT_OPTIONS = [
  { label: "Sans serif", options: ["Inter", "Archivo", "Jost", "Manrope", "DM Sans", "Plus Jakarta Sans", "Outfit", "Poppins", "Figtree", "Work Sans", "Mulish", "Nunito Sans", "Space Grotesk", "Fira Sans", "Mukta"].map((f) => ({ value: f, label: f })) },
  { label: "Serif & display", options: ["Playfair Display", "Fraunces", "Cormorant Garamond", "Lora", "DM Serif Display", "Libre Baskerville", "Marcellus", "Bodoni Moda", "Italiana"].map((f) => ({ value: f, label: f })) },
];

/** A real upload, not a URL paste — matches how the Products page picks
 * images (uploadImage -> Files library), so a merchant never needs to know
 * what a public image URL even is to put a photo in a theme section. */
function ImagePickerField({ value, onChange }) {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const library = <MediaLibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} onSelect={(url) => onChange(url)} />;

  async function handleUpload(file) {
    setUploading(true);
    try {
      const uploaded = await uploadImage(file);
      onChange(uploaded.url);
    } catch (err) {
      message.error(err.message);
    } finally {
      setUploading(false);
    }
    return false; // never let antd try to actually submit the file itself
  }

  if (value) {
    return (
      <div className="flex flex-col gap-2">
      <div className="relative inline-block self-start">
        <img src={value} alt="" className="w-full max-w-[160px] rounded-md border border-app-border object-cover" style={{ aspectRatio: "1" }} />
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute -top-2 -right-2 bg-white border border-app-border rounded-full w-6 h-6 flex items-center justify-center shadow-sm"
          aria-label="Remove image"
        >
          <X size={12} />
        </button>
      </div>
      <Button size="small" className="self-start" icon={<Images size={13} aria-hidden="true" />} onClick={() => setLibraryOpen(true)}>
        Change
      </Button>
      {library}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Upload accept={IMAGE_ACCEPT} showUploadList={false} beforeUpload={handleUpload} disabled={uploading}>
        <Button icon={<UploadIcon size={14} aria-hidden="true" />} loading={uploading}>
          Upload
        </Button>
      </Upload>
      <Button icon={<Images size={14} aria-hidden="true" />} onClick={() => setLibraryOpen(true)}>
        Choose from Files
      </Button>
      {library}
    </div>
  );
}

/** Renders the right input for one schema setting. Free-text inputs
 * (text/textarea/number) keep their own local draft state and only commit
 * to the store `onBlur` — committing on every keystroke would flood the
 * undo history with one entry per character, which makes undo useless. */
export function SettingField({ setting, value, onChange, products = [], collections = [], menus = [] }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  switch (setting.type) {
    case "textarea":
    case "richtext":
      return (
        <Input.TextArea rows={3} value={local} onChange={(e) => setLocal(e.target.value)} onBlur={() => onChange(local)} />
      );

    case "number":
      return <InputNumber className="w-full" value={local} onChange={setLocal} onBlur={() => onChange(local)} />;

    case "checkbox":
      return <Switch checked={Boolean(value)} onChange={onChange} />;

    case "range":
      return (
        <div className="flex items-center gap-3">
          <Slider
            className="flex-1"
            min={setting.min ?? 0}
            max={setting.max ?? 100}
            step={setting.step ?? 1}
            value={Number(local) || 0}
            onChange={setLocal}
            onChangeComplete={() => onChange(local)}
          />
          <span className="text-xs text-ink-muted w-10 text-right">{local}</span>
        </div>
      );

    case "select":
      return (
        <Select
          className="w-full"
          value={value}
          onChange={onChange}
          options={(setting.options || []).map((o) => ({ value: o.value, label: o.label }))}
        />
      );

    case "color":
      return <ColorPicker value={value || "#000000"} onChangeComplete={(c) => onChange(c.toHexString())} showText />;

    case "font":
      return <Select className="w-full" showSearch value={value} onChange={onChange} options={FONT_OPTIONS} />;

    case "collection":
      return (
        <Select
          className="w-full"
          allowClear
          value={value || undefined}
          placeholder="Select a collection"
          onChange={(v) => onChange(v || "")}
          options={collections.map((c) => ({ value: c.slug, label: c.title }))}
        />
      );

    case "product":
      return (
        <Select
          className="w-full"
          allowClear
          value={value || undefined}
          placeholder="Select a product"
          onChange={(v) => onChange(v || "")}
          options={products.map((p) => ({ value: p.slug, label: p.title }))}
        />
      );

    // Multi-select — every collection picked renders, in the order picked.
    // Not block-based on purpose: a merchant picking just 2 collections and
    // wanting them center-aligned couldn't do that with one block per
    // collection (the grid always stretched to fill every column slot).
    case "collection_list":
      return (
        <Select
          mode="multiple"
          className="w-full"
          allowClear
          value={value || []}
          placeholder="Select collections"
          onChange={(v) => onChange(v || [])}
          options={collections.map((c) => ({ value: c.slug, label: c.title }))}
        />
      );

    // Menu handle — a real dropdown of the store's own named menus (built
    // under Content > Navigation), never a handle a merchant has to type
    // and hope they spelled the same way as the menu they created.
    case "menu":
      return (
        <Select
          className="w-full"
          allowClear
          value={value || undefined}
          placeholder="Select a menu"
          onChange={(v) => onChange(v || "")}
          options={(menus || []).map((m) => ({ value: m.handle, label: m.title }))}
        />
      );

    case "image_picker":
      return <ImagePickerField value={value} onChange={onChange} />;

    case "url":
    case "text":
    default:
      return <Input value={local} onChange={(e) => setLocal(e.target.value)} onBlur={() => onChange(local)} />;
  }
}

/**
 * Renders one schema's `settings` array as labelled fields, with a "header"
 * type rendered as a plain section divider instead of an input — Shopify's
 * own convention for grouping related fields (e.g. "Slideshow settings")
 * without those becoming a phantom setting written into the section's data.
 * Both SettingsPanel (per-template sections) and GlobalSectionsDrawer
 * (header/footer/announcement-bar) share this so the two never drift.
 */
export function SettingsFieldList({ settings, values, onChange, products, collections, menus }) {
  return settings.map((setting, i) => {
    if (setting.type === "header") {
      return (
        <div key={`header-${i}`} className={i === 0 ? "text-xs font-semibold uppercase text-ink-muted" : "text-xs font-semibold uppercase text-ink-muted border-t border-app-border pt-4 mt-1"}>
          {setting.content}
        </div>
      );
    }
    if (setting.type === "paragraph") {
      return (
        <p key={`p-${i}`} className="text-xs text-ink-muted -mt-2">{setting.content}</p>
      );
    }
    return (
      <div key={setting.id}>
        <label className="block text-xs font-medium text-ink-muted mb-1">{setting.label}</label>
        <SettingField
          setting={setting}
          value={values[setting.id]}
          products={products}
          collections={collections}
          menus={menus}
          onChange={(value) => onChange(setting.id, value)}
        />
        {setting.info && <p className="text-[11px] text-ink-muted mt-1 mb-0">{setting.info}</p>}
      </div>
    );
  });
}
