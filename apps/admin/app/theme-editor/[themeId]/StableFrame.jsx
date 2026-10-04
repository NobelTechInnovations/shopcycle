"use client";

import { useEffect, useRef, useState } from "react";

/**
 * An iframe preview that updates without jumping. Each new version of the
 * page loads into a hidden second iframe; once it has loaded, it takes the
 * visible one's scroll position and swaps in. The seller keeps looking at
 * the section they're editing instead of being thrown back to the top, and
 * never sees a blank flash while a version loads.
 *
 * `activeRef` always points at the iframe on screen (for postMessage and
 * for telling its messages apart from the hidden one's); `onShown` runs
 * each time a version comes on screen. A new `page` (another template or
 * item) opens at the top instead.
 */
export function StableFrame({ srcDoc, title, activeRef, onShown, page = "" }) {
  const a = useRef(null);
  const b = useRef(null);
  const frames = [a, b];
  const [docs, setDocs] = useState([srcDoc, ""]);
  const [front, setFront] = useState(0);
  const state = useRef({ front: 0, want: srcDoc, wantSlot: 0, frontPage: page, wantPage: page });
  const onShownRef = useRef(onShown);
  onShownRef.current = onShown;

  // What an iframe really holds — its attribute, not our bookkeeping, so a
  // late load event for an older version is never mistaken for the new one.
  const holds = (i) => frames[i].current?.getAttribute("srcdoc") ?? null;
  const loaded = useRef([false, false]);

  function show(i) {
    const s = state.current;
    const from = frames[s.front].current?.contentWindow;
    const to = frames[i].current?.contentWindow;
    if (from && to && i !== s.front && s.wantPage === s.frontPage) {
      try {
        to.scrollTo({ top: from.scrollY, left: from.scrollX, behavior: "instant" });
      } catch {
        // A page that blocks scripting — it simply opens at the top.
      }
    }
    s.front = i;
    s.frontPage = s.wantPage;
    s.wantSlot = null;
    setFront(i);
    if (activeRef) activeRef.current = frames[i].current;
    onShownRef.current?.(frames[i].current);
  }

  useEffect(() => {
    const s = state.current;
    s.want = srcDoc;
    s.wantPage = page;
    if (holds(s.front) === srcDoc) {
      // Already on screen (or the first version, still loading).
      s.wantSlot = loaded.current[s.front] ? null : s.front;
      return;
    }
    const back = 1 - s.front;
    s.wantSlot = back;
    if (holds(back) === srcDoc && loaded.current[back]) {
      show(back);
      return;
    }
    loaded.current[back] = false;
    setDocs((cur) => (back === 0 ? [srcDoc, cur[1]] : [cur[0], srcDoc]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcDoc]);

  function onLoad(i) {
    const s = state.current;
    loaded.current[i] = holds(i) != null;
    if (s.wantSlot === i && holds(i) === s.want) show(i);
  }

  const frameStyle = (i) => ({
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    border: "none",
    background: "#fff",
    visibility: i === front ? "visible" : "hidden",
    pointerEvents: i === front ? "auto" : "none",
    zIndex: i === front ? 1 : 0,
  });

  return (
    <>
      {[0, 1].map((i) => (
        <iframe
          key={i}
          ref={frames[i]}
          title={i === front ? title : `${title} (loading)`}
          aria-hidden={i === front ? undefined : true}
          tabIndex={i === front ? undefined : -1}
          srcDoc={docs[i]}
          onLoad={() => onLoad(i)}
          style={frameStyle(i)}
        />
      ))}
    </>
  );
}
