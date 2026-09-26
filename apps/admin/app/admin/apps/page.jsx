"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Button, Modal, Form, Input, InputNumber, Select, Switch, Tag, App } from "antd";
import { Plus, Trash2, Crown, Lock } from "lucide-react";
import { useConfirmDialog, PageHeader, AppIcon, useHasMounted } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";

// A handful of apps have a full dedicated panel (Connect flow, campaign
// builder, message composer — see MetaConnectPanel) instead of the
// generic settingsSchema install form every other app in this catalog
// uses. Keyed by App.key; anything not listed here stays on the generic
// Configure/Install flow below.
const DEDICATED_PANELS = {
  "meta-ads": "/admin/apps/meta-ads",
  whatsapp: "/admin/apps/whatsapp",
};

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
  const mounted = useHasMounted();
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

  // `app` defaults to the one open in the Configure modal; apps with no
  // settings (Meta Ads, WhatsApp) install straight from their card and
  // pass themselves in — there's no modal, so `configuring` is null then.
  async function handleInstall(values, app = configuring) {
    try {
      await apiFetch(`/api/apps/${app.key}/install`, { method: "POST", body: { settings: values } });
      message.success(`${app.name} installed`);
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
      <p className="text-sm text-ink-muted -mt-3 mb-6">
        Add features to your store. Premium apps are included with the Premium plan.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {apps.map((app) => (
          <Card
            key={app.id}
            size="small"
            loading={loading}
            className="!shadow-card hover:!shadow-raised transition-shadow"
            styles={{ body: { padding: 18, height: "100%", display: "flex", flexDirection: "column" } }}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="w-10 h-10 rounded-lg bg-app-bg border border-app-border flex items-center justify-center">
                <AppIcon iconKey={app.iconKey} size={19} className="text-ink" />
              </div>
              <div className="flex gap-1.5">
                {app.premium && (
                  <Tag className="!mr-0 !border-0 !bg-accent-soft !text-accent inline-flex items-center gap-1">
                    <Crown size={11} aria-hidden="true" /> Premium
                  </Tag>
                )}
                {app.installed && (
                  <Tag color="success" className="!mr-0">
                    Installed
                  </Tag>
                )}
              </div>
            </div>
            <p className="font-semibold text-[15px] text-ink m-0">{app.name}</p>
            <p className="text-[13px] text-ink-muted mt-1 mb-4 leading-relaxed line-clamp-3">{app.description}</p>
            <div className="flex gap-2 mt-auto">
              {app.locked && !app.installed ? (
                <Link href="/admin/settings/billing">
                  <Button icon={<Lock size={13} aria-hidden="true" />}>Upgrade to install</Button>
                </Link>
              ) : app.installed ? (
                <>
                  {DEDICATED_PANELS[app.key] ? (
                    <Link href={DEDICATED_PANELS[app.key]}>
                      <Button type="primary">Open</Button>
                    </Link>
                  ) : (
                    app.settingsSchema.length > 0 && <Button onClick={() => openConfigure(app)}>Configure</Button>
                  )}
                  <Button danger type="text" onClick={() => handleUninstall(app)}>
                    Remove
                  </Button>
                </>
              ) : (
                <Button
                  type="primary"
                  onClick={() => (app.settingsSchema.length > 0 ? openConfigure(app) : handleInstall({}, app))}
                >
                  Install
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {mounted && (
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
      )}
    </div>
  );
}
