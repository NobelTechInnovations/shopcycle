"use client";

import { useEffect, useRef } from "react";
import { useEditorStore } from "./store";
import { useDraftRender, PreviewErrorBar } from "./draft-render";

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
// Injected into the preview: hovering outlines a section and shows its
// name, clicking selects it in the editor; links don't navigate away.
const PICKER = `<style>
[data-section-id]{position:relative}
[data-section-id].oy-hover{outline:2px dashed #7c5cff;outline-offset:-2px;cursor:pointer}
[data-section-id].oy-selected{outline:2px solid #7c5cff;outline-offset:-2px}
.oy-tag{position:absolute;top:8px;left:8px;z-index:9999;background:#7c5cff;color:#fff;font:600 11px/1 system-ui,sans-serif;padding:5px 8px;border-radius:4px;pointer-events:none}
</style><script>(function(){
var cur=null;
function sec(t){return t&&t.closest?t.closest('[data-section-id]'):null}
document.addEventListener('mouseover',function(e){var s=sec(e.target);if(s===cur)return;if(cur){cur.classList.remove('oy-hover');var t=cur.querySelector(':scope>.oy-tag');if(t)t.remove();}cur=s;if(s){s.classList.add('oy-hover');var tag=document.createElement('span');tag.className='oy-tag';tag.textContent=s.getAttribute('data-section-label')||'Section';s.appendChild(tag);}});
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a,button,form');if(a)e.preventDefault();var s=sec(e.target);if(s)parent.postMessage({oyEditor:'select',key:s.getAttribute('data-section-id')},'*');},true);
document.addEventListener('submit',function(e){e.preventDefault()},true);
window.addEventListener('message',function(e){if(!e.data||e.data.oyEditor!=='highlight')return;document.querySelectorAll('.oy-selected').forEach(function(n){n.classList.remove('oy-selected')});var s=e.data.key&&document.querySelector('[data-section-id="'+e.data.key+'"]');if(s){s.classList.add('oy-selected');if(e.data.scroll)s.scrollIntoView({behavior:'smooth',block:'start'});}});
parent.postMessage({oyEditor:'ready'},'*');
})();<\/script>`;

function withPicker(html, labels) {
  let out = html;
  for (const [key, label] of Object.entries(labels)) {
    out = out.replace(`data-section-id="${key}"`, `data-section-id="${key}" data-section-label="${String(label).replace(/"/g, "&quot;")}"`);
  }
  return out.includes("</body>") ? out.replace("</body>", `${PICKER}</body>`) : out + PICKER;
}

export function PreviewFrame({ themeId, templateName, previewSlug, device, selectable = false, labels = {} }) {
  const template = useEditorStore((s) => s.template);
  const settingsData = useEditorStore((s) => s.settingsData);
  const selectedSectionKey = useEditorStore((s) => s.selectedSectionKey);
  const selectSection = useEditorStore((s) => s.selectSection);
  const frameRef = useRef(null);
  const lastScrolled = useRef(null);

  // Product/collection previews need something to show.
  const kind = String(templateName || "").split(".")[0];
  const needsItem = ["product", "collection", "page"].includes(kind) && !previewSlug;
  const { html, error, retry } = useDraftRender(
    themeId,
    () => ({
      template: templateName,
      slug: previewSlug || undefined,
      templateOverride: template,
      settingsOverride: settingsData,
    }),
    [template, settingsData, templateName, previewSlug],
    { enabled: Boolean(template) && !needsItem }
  );

  // Clicks in the preview select sections.
  useEffect(() => {
    if (!selectable) return;
    function onMessage(e) {
      if (e.source !== frameRef.current?.contentWindow || !e.data?.oyEditor) return;
      if (e.data.oyEditor === "select" && e.data.key) {
        lastScrolled.current = e.data.key; // already in view — don't jump
        selectSection(e.data.key);
      }
      if (e.data.oyEditor === "ready") highlight(false);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  });

  function highlight(scroll) {
    frameRef.current?.contentWindow?.postMessage({ oyEditor: "highlight", key: selectedSectionKey, scroll }, "*");
  }

  // Picking a section in the list scrolls the preview to it.
  useEffect(() => {
    if (!selectable) return;
    const scroll = selectedSectionKey && lastScrolled.current !== selectedSectionKey;
    lastScrolled.current = selectedSectionKey;
    highlight(scroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSectionKey, selectable]);

  let srcDoc;
  if (needsItem) {
    srcDoc = `<div style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:90vh;text-align:center;color:#6b7280"><div><p style="font-size:15px;color:#111;margin:0 0 6px">Nothing to preview yet</p><p style="font-size:13px;margin:0">Add an active ${kind} first — its page shows here.</p></div></div>`;
  } else if (html) {
    srcDoc = selectable ? withPicker(html, labels) : html;
  } else if (error) {
    srcDoc = `<p style="font-family:system-ui,sans-serif;padding:24px;color:#6b7280">The preview will show here once it loads.</p>`;
  } else {
    srcDoc = LOADING_HTML;
  }

  const width = device === "mobile" ? 390 : "100%";

  return (
    <div className="relative h-full flex justify-center bg-app-bg overflow-auto py-4">
      <PreviewErrorBar error={needsItem ? null : error} onRetry={retry} hasPreview={Boolean(html)} />
      <iframe
        ref={frameRef}
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
