"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useEditorStore } from "./store";

const LOADING_HTML =
  "<p style=\"font-family:system-ui,sans-serif;padding:24px;color:#888\">Loading preview…</p>";

/**
 * The entire "live preview" mechanism: on every draft change, POST the
 * unsaved template + settings to the theme's render-draft endpoint and
 * swap the iframe's `srcDoc`. Nothing is ever written to the database by
 * this path — Save (autosave or explicit) is a completely separate call.
 * `srcDoc` replaces the iframe's content in one shot with no navigation,
 * which is what keeps this from ever showing a blank-page flash.
 */
export function PreviewFrame({ themeId, templateName, previewSlug, device }) {
  const template = useEditorStore((s) => s.template);
  const settingsData = useEditorStore((s) => s.settingsData);
  const [srcDoc, setSrcDoc] = useState(LOADING_HTML);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!template) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      try {
        const { html } = await apiFetch(`/api/themes/${themeId}/render-draft`, {
          method: "POST",
          body: {
            template: templateName,
            slug: previewSlug || undefined,
            templateOverride: template,
            settingsOverride: settingsData,
          },
        });
        setSrcDoc(html);
      } catch (err) {
        setSrcDoc(
          `<p style="font-family:system-ui,sans-serif;padding:24px;color:#b91c1c">Preview error: ${err.message}</p>`
        );
      }
    }, 400);
    return () => clearTimeout(timeoutRef.current);
  }, [template, settingsData, themeId, templateName, previewSlug]);

  const width = device === "mobile" ? 390 : "100%";

  return (
    <div className="h-full flex justify-center bg-app-bg overflow-auto py-4">
      <iframe
        title="Theme preview"
        srcDoc={srcDoc}
        style={{
          width,
          // Without these two, a flex child with a fixed width still gets
          // compressed to fit its container — verified by measurement: the
          // 390px mobile frame was actually rendering at ~300px because
          // the center column is often narrower than that once the
          // section list and settings panel are accounted for. flex-shrink:
          // 0 + matching minWidth is what makes 390 actually mean 390,
          // with the container's own overflow-auto providing horizontal
          // scroll for whatever doesn't fit — the same tradeoff every
          // device-preview tool (including Chrome DevTools) makes.
          minWidth: device === "mobile" ? width : undefined,
          flexShrink: 0,
          height: "100%",
          border: "none",
          background: "#fff",
          boxShadow: device === "mobile" ? "0 0 0 1px #e5e7eb" : "none",
          transition: "width 150ms ease",
        }}
      />
    </div>
  );
}
