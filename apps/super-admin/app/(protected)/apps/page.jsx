"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Modal, Form, Input, Select, App } from "antd";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { PageHeader, useConfirmDialog, AppIcon, APP_ICON_OPTIONS } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

const CATEGORY_OPTIONS = [
  { value: "analytics", label: "Analytics" },
  { value: "marketing", label: "Marketing" },
  { value: "utility", label: "Utility" },
  { value: "other", label: "Other" },
];

const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Text area" },
  { value: "number", label: "Number" },
];

export default function SuperAdminAppsPage() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/super-admin/apps");
      setApps(data.apps);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setEditing({});
    form.resetFields();
    form.setFieldsValue({ category: "other", iconKey: "puzzle", settingsSchema: [] });
  }

  function openEdit(app) {
    setEditing(app);
    form.resetFields();
    form.setFieldsValue(app);
  }

  async function handleSubmit(values) {
    try {
      if (editing?.id) {
        await apiFetch(`/api/super-admin/apps/${editing.id}`, { method: "PATCH", body: values });
        message.success("App updated");
      } else {
        await apiFetch("/api/super-admin/apps", { method: "POST", body: values });
        message.success("App created");
      }
      setEditing(null);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  function handleDelete(app) {
    confirmDialog({
      title: `Delete "${app.name}"?`,
      description: "Any store with it installed loses it immediately.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        try {
          await apiFetch(`/api/super-admin/apps/${app.id}`, { method: "DELETE" });
          load();
        } catch (err) {
          message.error(err.message);
        }
      },
    });
  }

  return (
    <div>
      <PageHeader
        title="App catalog"
        actions={
          <Button type="primary" icon={<Plus size={14} aria-hidden="true" />} onClick={openNew}>
            New app
          </Button>
        }
      />

      <Card size="small" loading={loading}>
        {apps.map((a) => (
          <div key={a.id} className="flex items-center justify-between py-3 border-t border-app-border first:border-t-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-app-bg border border-app-border flex items-center justify-center shrink-0">
                <AppIcon iconKey={a.iconKey} size={16} className="text-ink" />
              </div>
              <div>
                <p className="text-sm font-medium m-0">{a.name}</p>
                <p className="text-xs text-ink-muted m-0">
                  <code>{a.key}</code> · {a.category}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="small" icon={<Pencil size={12} aria-hidden="true" />} onClick={() => openEdit(a)} />
              <Button size="small" danger icon={<Trash2 size={12} aria-hidden="true" />} onClick={() => handleDelete(a)} />
            </div>
          </div>
        ))}
      </Card>

      <Modal
        title={editing?.id ? "Edit app" : "New app"}
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        okText={editing?.id ? "Save" : "Create"}
        forceRender
        width={560}
      >
        <Form layout="vertical" form={form} onFinish={handleSubmit} requiredMark={false}>
          <Form.Item name="key" label="Key" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="my-app" disabled={Boolean(editing?.id)} />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="My App" />
          </Form.Item>
          <Form.Item name="iconKey" label="Icon" rules={[{ required: true, message: "Required" }]}>
            <Select
              className="w-40"
              options={APP_ICON_OPTIONS.map((key) => ({
                value: key,
                label: (
                  <span className="flex items-center gap-2">
                    <AppIcon iconKey={key} size={14} /> {key}
                  </span>
                ),
              }))}
            />
          </Form.Item>
          <Form.Item name="category" label="Category">
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.List name="settingsSchema">
            {(fields, { add, remove }) => (
              <div className="flex flex-col gap-2 mb-3">
                <label className="text-sm">Install settings fields</label>
                {fields.map((field) => (
                  <div key={field.key} className="flex gap-2 items-start border border-app-border rounded-md p-2">
                    <Form.Item name={[field.name, "id"]} className="mb-0 flex-1" rules={[{ required: true, message: "Required" }]}>
                      <Input placeholder="fieldId" size="small" />
                    </Form.Item>
                    <Form.Item name={[field.name, "label"]} className="mb-0 flex-1" rules={[{ required: true, message: "Required" }]}>
                      <Input placeholder="Label" size="small" />
                    </Form.Item>
                    <Form.Item name={[field.name, "type"]} className="mb-0" initialValue="text">
                      <Select options={FIELD_TYPE_OPTIONS} size="small" style={{ width: 100 }} />
                    </Form.Item>
                    <Button size="small" danger onClick={() => remove(field.name)}>
                      ×
                    </Button>
                  </div>
                ))}
                <Button size="small" onClick={() => add({ type: "text" })}>
                  + Add field
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}
