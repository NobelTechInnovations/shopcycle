"use client";

import { useRouter } from "next/navigation";
import { Modal } from "antd";
import { DISCOUNT_TYPES } from "./discount-text";

/** "Create discount": pick the kind first. */
export function TypePicker({ open, onClose }) {
  const router = useRouter();
  return (
    <Modal open={open} onCancel={onClose} footer={null} title="What kind of discount?" width={560} destroyOnHidden>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        {DISCOUNT_TYPES.map(({ key, icon: Icon, title, text }) => (
          <button
            key={key}
            type="button"
            onClick={() => router.push(`/admin/discounts/new?type=${key}`)}
            className="text-left rounded-xl border border-app-border bg-app-surface hover:border-ink-subtle hover:shadow-card p-4 cursor-pointer transition"
          >
            <span className="inline-flex w-9 h-9 items-center justify-center rounded-lg bg-app-bg text-ink mb-2">
              <Icon size={18} aria-hidden="true" />
            </span>
            <span className="block text-[14px] font-semibold text-ink">{title}</span>
            <span className="block text-[12.5px] text-ink-muted mt-0.5 leading-snug">{text}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
