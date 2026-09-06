"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Modal, Form, Input, InputNumber, Select, Switch, Tag, App } from "antd";
import { Plus, Trash2 } from "lucide-react";
import { useConfirmDialog, PageHeader } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

/** One field inside a repeater row — same small set of primitive types as
 * the top-level SettingsField, just nested under a Form.List's [name, key]. */
function RepeaterSubField({ field, name }) {
  switch (field.type) {
    case "textarea":
      return (
        <Form.Item name={name} label={field.label} className="mb-2">
          <Input.TextArea rows={2} placeholder={field.placeholder} />
        </Form.Item>
      );
    case "select":
      return (
        <Form.Item name={name} label={field.label} className="mb-2">
          <Select options={(field.options || []).map((o) => ({ value: o, label: String(o) }))} />
        </Form.Item>
      );
    case "checkbox":
      return (
        <Form.Item name={name} label={field.label} valuePropName="checked" className="mb-2">
          <Switch />
        </Form.Item>
      );
    case "number":
      return (
        <Form.Item name={name} label={field.label} className="mb-2">
          <InputNumber className="w-full" min={field.min} max={field.max} />
        </Form.Item>
      );
    default:
      return (
        <Form.Item name={name} label={field.label} className="mb-2">
          <Input placeholder={field.placeholder} />
        </Form.Item>
      );
  }
}

/**
 * "Add as many as you like" list — this is what makes a widget-style app
 * (e.g. Customer Reviews: add every review once, here, instead of a theme
 * section where each review is its own block a merchant has to add in the
 * theme editor) actually usable. Backed by antd's Form.List, so it's plain
 * nested form state — submits as an array under `field.id`.
 */
function RepeaterField({ field }) {
  return (
    <Form.Item label={field.label} className="mb-4">
      <Form.List name={field.id}>
        {(rows, { add, remove }) => (
          <div className="flex flex-col gap-3">
            {rows.map(({ key, name }) => (
              <div key={key} className="border border-app-border rounded-md p-3 relative">
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<Trash2 size={12} aria-hidden="true" />}
                  aria-label="Remove"
                  className="absolute top-2 right-2"
                  onClick={() => remove(name)}
                />
                {(field.fields || []).map((sub) => (
                  <RepeaterSubField key={sub.id} field={sub} name={[name, sub.id]} />
                ))}
              </div>
            ))}
            <Button size="small" icon={<Plus size={14} aria-hidden="true" />} onClick={() => add(field.defaults || {})}>
              Add {field.itemLabel || "item"}
            </Button>
          </div>
        )}
      </Form.List>
    </Form.Item>
  );
}

function SettingsField({ field }) {
  if (field.type === "repeater") {
    return <RepeaterField key={field.id} field={field} />;
  }
  if (field.type === "textarea") {
    return (
      <Form.Item key={field.id} name={field.id} label={field.label}>
        <Input.TextArea rows={4} placeholder={field.placeholder} />
      </Form.Item>
    );
  }
  return (
    <Form.Item key={field.id} name={field.id} label={field.label} rules={[{ required: true, message: "Required" }]}>
      <Input placeholder={field.placeholder} />
    </Form.Item>
  );
}

export default function AppsPage() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [configuring, setConfiguring] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/apps");
      setApps(data.apps);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openConfigure(app) {
    setConfiguring(app);
    form.resetFields();
    form.setFieldsValue(app.settings || {});
  }

  async function handleInstall(values) {
    try {
      await apiFetch(`/api/apps/${configuring.key}/install`, { method: "POST", body: { settings: values } });
      message.success(`${configuring.name} installed`);
      setConfiguring(null);
      form.resetFields();
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  function handleUninstall(app) {
    confirmDialog({
      title: `Remove ${app.name}?`,
      description: "This stops it from running on your storefront immediately.",
      okText: "Remove",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/apps/${app.key}/uninstall`, { method: "POST" });
        load();
      },
    });
  }

  return (
    <div>
      <PageHeader title="Apps" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {apps.map((app) => (
          <Card key={app.id} size="small" loading={loading}>
            <div className="flex items-start justify-between mb-2">
              <span className="text-2xl" aria-hidden="true">
                {app.iconEmoji}
              </span>
              {app.installed && <Tag color="green">Installed</Tag>}
            </div>
            <p className="font-medium m-0">{app.name}</p>
            <p className="text-sm text-ink-muted mt-1 mb-3">{app.description}</p>
            <div className="flex gap-2">
              {app.installed ? (
                <>
                  {app.settingsSchema.length > 0 && (
                    <Button size="small" onClick={() => openConfigure(app)}>
                      Configure
                    </Button>
                  )}
                  <Button size="small" danger onClick={() => handleUninstall(app)}>
                    Remove
                  </Button>
                </>
              ) : (
                <Button
                  size="small"
                  type="primary"
                  onClick={() => (app.settingsSchema.length > 0 ? openConfigure(app) : handleInstall({}))}
                >
                  Install
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        title={configuring ? `Configure ${configuring.name}` : ""}
        open={Boolean(configuring)}
        onCancel={() => setConfiguring(null)}
        onOk={() => form.submit()}
        okText={configuring?.installed ? "Save" : "Install"}
        forceRender
      >
        <Form layout="vertical" form={form} onFinish={handleInstall} requiredMark={false}>
          {configuring?.settingsSchema.map((field) => (
            <SettingsField key={field.id} field={field} />
          ))}
        </Form>
      </Modal>
    </div>
  );
}
