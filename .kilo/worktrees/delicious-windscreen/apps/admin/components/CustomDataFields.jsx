"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Form, Input, InputNumber, Select, Switch, ColorPicker, Skeleton } from "antd";
import { SlidersHorizontal } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { ImageUploadField } from "./ImageUploadField";

/** The input for one custom data field, by its type. `props` are the
 * value/onChange that Form.Item gives its child — they must reach the
 * real input, or the field never shows its saved value or saves a new one. */
function FieldInput({ def, ...props }) {
  switch (def.type) {
    case "text":
      return def.choices?.length ? (
        <Select {...props} allowClear placeholder="Choose…" options={def.choices.map((c) => ({ value: c, label: c }))} />
      ) : (
        <Input {...props} maxLength={255} />
      );
    case "multiline":
      return <Input.TextArea {...props} autoSize={{ minRows: 2, maxRows: 8 }} maxLength={5000} />;
    case "number":
      return <InputNumber {...props} className="w-full" />;
    case "date":
      return <Input {...props} type="date" />;
    case "url":
      return <Input {...props} placeholder="https://" inputMode="url" />;
    case "list":
      return <Select {...props} mode="tags" tokenSeparators={[","]} placeholder="Type and press Enter" open={false} suffixIcon={null} />;
    default:
      return <Input {...props} />;
  }
}

function fieldProps(def) {
  const base = { name: ["metafields", def.key], label: def.name, extra: def.description || undefined };
  if (def.type === "boolean") return { ...base, valuePropName: "checked" };
  if (def.type === "color") return { ...base, getValueFromEvent: (c) => (c ? c.toHexString() : null) };
  return base;
}

/**
 * "Custom data" card for the product and collection forms: one input per
 * field defined under Settings ▸ Custom data, bound to the form's
 * `metafields` object. With no fields defined yet it shows a short
 * pointer to where they're set up.
 */
export function CustomDataFields({ ownerType = "product" }) {
  const [defs, setDefs] = useState(null);

  useEffect(() => {
    apiFetch(`/api/metafields?owner=${ownerType}`)
      .then((d) => setDefs(d.definitions))
      .catch(() => setDefs([]));
  }, [ownerType]);

  const settingsLink = (
    <Link href="/admin/settings/custom-data" className="text-xs font-normal">
      Manage fields
    </Link>
  );

  if (defs === null) {
    return (
      <Card size="small" title="Custom data">
        <Skeleton active paragraph={{ rows: 2 }} title={false} />
      </Card>
    );
  }

  if (!defs.length) {
    return (
      <Card size="small" title="Custom data">
        <div className="flex items-start gap-3">
          <SlidersHorizontal size={16} className="text-ink-subtle mt-0.5 shrink-0" aria-hidden="true" />
          <p className="m-0 text-[13px] text-ink-muted">
            Add your own fields — like <b>Fabric</b>, <b>Fit</b>, <b>Care instructions</b> or a <b>Size chart</b> — and fill them in here for every {ownerType}.{" "}
            <Link href="/admin/settings/custom-data">Set up fields</Link>
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card size="small" title="Custom data" extra={settingsLink}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
        {defs.map((def) => {
          const wide = def.type === "multiline" || def.type === "image" || def.type === "list";
          return (
            <div key={def.id} className={wide ? "md:col-span-2" : undefined}>
              {def.type === "boolean" ? (
                <Form.Item {...fieldProps(def)}>
                  <Switch />
                </Form.Item>
              ) : def.type === "color" ? (
                <Form.Item {...fieldProps(def)}>
                  <ColorPicker showText allowClear format="hex" disabledAlpha />
                </Form.Item>
              ) : def.type === "image" ? (
                <Form.Item {...fieldProps(def)}>
                  <ImageUploadField aspect="4 / 3" label={`Upload ${def.name.toLowerCase()}`} />
                </Form.Item>
              ) : (
                <Form.Item {...fieldProps(def)}>
                  <FieldInput def={def} />
                </Form.Item>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Blank inputs are sent as null so the API clears them (a cleared Select
 * is `undefined`, which JSON would silently drop). */
export function metafieldPayload(values) {
  if (!values || typeof values !== "object") return undefined;
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === undefined ? null : v]));
}
