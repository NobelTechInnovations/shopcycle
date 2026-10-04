"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Form, Select } from "antd";
import { LayoutTemplate } from "lucide-react";
import { apiFetch } from "@/lib/api";

const NOUN = { product: "product", page: "page", collection: "collection" };

let cache = null;
let cachedAt = 0;
/** The active theme's extra templates (kept for a minute — a template made
 * in the theme editor shows up on the next visit). */
function loadTemplates() {
  if (!cache || Date.now() - cachedAt > 60 * 1000) {
    cachedAt = Date.now();
    cache = apiFetch("/api/themes/templates").catch(() => null);
  }
  return cache;
}

/**
 * "Theme template": which layout of the active theme shows this product,
 * page or collection — the default, or one the seller made in the theme
 * editor (Create template), or one an app brought (Rentals: "Rental
 * product"). Field name: templateSuffix.
 */
export function ThemeTemplateField({ kind, hint }) {
  const [data, setData] = useState(null);
  const value = Form.useWatch("templateSuffix");

  useEffect(() => {
    let live = true;
    loadTemplates().then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);

  const list = data?.[kind] || [];
  const editorHref = data?.themeId ? `/theme-editor/${data.themeId}?template=${value ? `${kind}.${value}` : kind}` : null;
  const known = !value || list.some((t) => t.suffix === value);

  return (
    <>
      <Form.Item name="templateSuffix" label="Theme template" className="mb-1" extra={hint}>
        <Select
          options={[
            // "" saves as no template (the default); null/undefined would leave it unchanged.
            { value: "", label: `Default ${NOUN[kind]}` },
            ...list.map((t) => ({ value: t.suffix, label: t.label })),
            ...(!known ? [{ value, label: `${value} (not in your current theme — shows the default)` }] : []),
          ]}
          placeholder={`Default ${NOUN[kind]}`}
        />
      </Form.Item>
      {editorHref && (
        <Link href={editorHref} className="inline-flex items-center gap-1.5 text-[12.5px] text-accent no-underline hover:underline">
          <LayoutTemplate size={13} aria-hidden="true" />
          {list.length ? "Edit or create templates in the theme editor" : `Make a different layout for some ${NOUN[kind]}s`}
        </Link>
      )}
    </>
  );
}
