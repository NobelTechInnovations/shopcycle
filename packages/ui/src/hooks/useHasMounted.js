"use client";

import { useEffect, useState } from "react";

/**
 * False during server render and the first client render, true after.
 * For UI that can only exist in the browser — notably an AntD `<Modal
 * forceRender>`, which portals into document.body immediately: the server
 * has no body to portal into, so rendering it during SSR makes the HTML
 * differ and React discards and rebuilds the whole page tree ("Hydration
 * failed"). Gate it with `{mounted && <Modal forceRender ... />}`.
 */
export function useHasMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
