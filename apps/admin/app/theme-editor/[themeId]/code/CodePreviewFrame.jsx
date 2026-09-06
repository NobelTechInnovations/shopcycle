"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const LOADING_HTML = "<p style=\"font-family:system-ui,sans-serif;padding:24px;color:#888\">Loading preview…</p>";

/** Same debounced-render-into-srcDoc mechanism as the visual editor's
 * PreviewFrame, but driven by raw file content instead of template/settings
 * JSON — `filesOverride` merges the currently-edited file's unsaved content
 * over the theme's persisted files for one render call, nothing is written. */
export function CodePreviewFrame({ themeId, templateName, previewSlug, filePath, fileContent }) {
  const [srcDoc, setSrcDoc] = useState(LOADING_HTML);
  const timeoutRef = useRef(null);

  useEffect(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      try {
        const { html } = await apiFetch(`/api/themes/${themeId}/render-draft`, {
          method: "POST",
          body: {
            template: templateName,
            slug: previewSlug || undefined,
            filesOverride: { [filePath]: fileContent },
          },
        });
        setSrcDoc(html);
      } catch (err) {
        setSrcDoc(
          `<p style="font-family:system-ui,sans-serif;padding:24px;color:#b91c1c">Preview error: ${err.message}</p>`
        );
      }
    }, 500);
    return () => clearTimeout(timeoutRef.current);
  }, [themeId, templateName, previewSlug, filePath, fileContent]);

  return (
    <div className="h-full bg-app-bg overflow-auto py-4 flex justify-center">
      <iframe
        title="Code preview"
        srcDoc={srcDoc}
        style={{ width: "100%", maxWidth: 900, height: "100%", border: "none", background: "#fff" }}
      />
    </div>
  );
}
