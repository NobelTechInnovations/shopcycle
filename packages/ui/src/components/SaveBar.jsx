"use client";

import { useEffect } from "react";
import { Button } from "antd";

/** Warns before the tab is closed or reloaded while `when` is true.
 * (Client-side navigation inside the app doesn't unload the page, so a
 * save that ends in router.push never triggers it.) */
export function useUnsavedChangesWarning(when) {
  useEffect(() => {
    if (!when) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);
}

/**
 * The editor's contextual save bar — floats at the bottom of every
 * create/edit form. It turns dark and says "Unsaved changes" the moment
 * anything is edited (Save is disabled until then, so a merchant can see at
 * a glance whether there's anything to save), and closing the tab with
 * unsaved edits asks first. Must be rendered inside the <Form>: Save is the
 * form's submit button.
 */
export function SaveBar({ dirty, isNew = false, saving = false, saveLabel = "Save", onDiscard }) {
  useUnsavedChangesWarning(dirty && !saving);
  const active = dirty || isNew;

  return (
    <div className="sticky bottom-4 z-20 mt-8 flex justify-center pointer-events-none print:hidden">
      <div
        role="region"
        aria-label="Save changes"
        className={`pointer-events-auto w-full max-w-2xl flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 transition-colors duration-200 ${
          active ? "bg-[#111114] text-white shadow-raised" : "bg-app-surface border border-app-border text-ink-muted shadow-card"
        }`}
      >
        <span className="text-[13px] flex items-center gap-2" aria-live="polite">
          {dirty ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-accent-2" aria-hidden="true" />
              Unsaved changes
            </>
          ) : isNew ? (
            "Not saved yet"
          ) : (
            "All changes saved"
          )}
        </span>
        <div className="flex gap-2">
          <Button
            onClick={onDiscard}
            disabled={saving}
            className={active ? "!bg-transparent !text-white !border-white/30 hover:!border-white/60" : ""}
          >
            Discard
          </Button>
          <Button
            htmlType="submit"
            loading={saving}
            disabled={!active}
            className={active ? "!bg-white !text-[#111114] !border-white hover:!bg-white/90 font-semibold" : ""}
          >
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
