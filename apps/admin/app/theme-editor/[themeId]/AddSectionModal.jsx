"use client";

import { Modal, List } from "antd";
import { Plus } from "lucide-react";

export function AddSectionModal({ open, onClose, catalog, onAdd }) {
  return (
    <Modal title="Add section" open={open} onCancel={onClose} footer={null} destroyOnHidden>
      <List
        dataSource={Object.entries(catalog)}
        renderItem={([type, schema]) => (
          <List.Item
            className="!cursor-pointer hover:bg-app-bg px-2 rounded-md"
            onClick={() => {
              onAdd(type);
              onClose();
            }}
          >
            <span className="flex items-center gap-2 text-sm">
              <Plus size={14} className="text-ink-muted" aria-hidden="true" />
              {schema.name || type}
            </span>
          </List.Item>
        )}
      />
    </Modal>
  );
}
