"use client";

import { useDraftRender, PreviewErrorBar } from "../draft-render";
import { StableFrame } from "../StableFrame";

const LOADING_HTML = "<p style=\"font-family:system-ui,sans-serif;padding:24px;color:#888\">Loading preview…</p>";

/** Same debounced-render mechanism as the visual editor's PreviewFrame
 * (and the same no-jump swap), but driven by raw file content instead of
 * template/settings JSON — `filesOverride` merges the currently-edited
 * file's unsaved content over the theme's persisted files for one render
 * call, nothing is written. */
export function CodePreviewFrame({ themeId, templateName, previewSlug, filePath, fileContent }) {
  const { html, error, retry } = useDraftRender(
    themeId,
    () => ({
      template: templateName,
      slug: previewSlug || undefined,
      filesOverride: { [filePath]: fileContent },
    }),
    [templateName, previewSlug, filePath, fileContent],
    { delay: 500 }
  );

  return (
    <div className="relative h-full bg-app-bg overflow-auto py-4 flex justify-center">
      <PreviewErrorBar error={error} onRetry={retry} hasPreview={Boolean(html)} />
      <div style={{ position: "relative", width: "100%", maxWidth: 900, height: "100%" }}>
        <StableFrame srcDoc={html || LOADING_HTML} title="Code preview" />
      </div>
    </div>
  );
}
