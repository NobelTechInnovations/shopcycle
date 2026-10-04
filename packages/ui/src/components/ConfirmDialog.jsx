"use client";

import { App } from "antd";

/** Every destructive action in the admin (delete product, deactivate a
 * customer, remove a file) should route through this instead of a raw
 * `window.confirm` — it keeps focus trapped and restored correctly, and
 * gives destructive actions a consistent red confirm button. */
export function useConfirmDialog() {
  const { modal } = App.useApp();

  /** Either style works: pass `onConfirm`, or await the result — true
   * when they confirm, false when they cancel. `content` is accepted as
   * another name for `description`. */
  function confirmDialog({ title, description, content, okText = "Confirm", danger = false, onConfirm, onCancel }) {
    return new Promise((resolve) => {
      modal.confirm({
        title,
        content: description ?? content,
        okText,
        cancelText: "Cancel",
        okButtonProps: { danger },
        onOk: async () => {
          if (onConfirm) await onConfirm();
          resolve(true);
        },
        onCancel: () => {
          onCancel?.();
          resolve(false);
        },
      });
    });
  }

  return { confirmDialog };
}
