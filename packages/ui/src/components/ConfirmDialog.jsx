"use client";

import { App } from "antd";

/** Every destructive action in the admin (delete product, deactivate a
 * customer, remove a file) should route through this instead of a raw
 * `window.confirm` — it keeps focus trapped and restored correctly, and
 * gives destructive actions a consistent red confirm button. */
export function useConfirmDialog() {
  const { modal } = App.useApp();

  function confirmDialog({ title, description, okText = "Confirm", danger = false, onConfirm }) {
    modal.confirm({
      title,
      content: description,
      okText,
      cancelText: "Cancel",
      okButtonProps: { danger },
      onOk: onConfirm,
    });
  }

  return { confirmDialog };
}
