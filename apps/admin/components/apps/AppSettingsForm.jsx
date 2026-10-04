"use client";

import { Button, Form, Input, InputNumber, Select, Switch } from "antd";
import { Plus, Trash2 } from "lucide-react";
import { PixelSetup } from "@/app/admin/apps/PixelSetup";

/**
 * The generic settings form an app declares in its settingsSchema
 * ([{ id, label, type }]) — so most apps need no admin UI of their own.
 * The Facebook Pixel app swaps in its "Continue with Facebook" picker.
 */

const optionOf = (o) => (typeof o === "object" ? o : { value: o, label: String(o) });

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
          <Select options={(field.options || []).map(optionOf)} />
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

/** "Add as many as you like" — e.g. every testimonial, once, here. */
function RepeaterField({ field }) {
  return (
    <Form.Item label={field.label} className="mb-4">
      <Form.List name={field.id}>
        {(rows, { add, remove }) => (
          <div className="flex flex-col gap-3">
            {rows.map(({ key, name }) => (
              <div key={key} className="border border-app-border rounded-md p-3 relative">
                <Button size="small" type="text" danger icon={<Trash2 size={12} aria-hidden="true" />} aria-label="Remove" className="absolute top-2 right-2" onClick={() => remove(name)} />
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
  if (field.type === "repeater") return <RepeaterField field={field} />;
  if (field.type === "select") {
    const options = (field.options || []).map(optionOf);
    return (
      <Form.Item name={field.id} label={field.label} initialValue={options[0]?.value} rules={[{ required: true, message: "Required" }]}>
        <Select options={options} />
      </Form.Item>
    );
  }
  if (field.type === "textarea") {
    return (
      <Form.Item name={field.id} label={field.label}>
        <Input.TextArea rows={4} placeholder={field.placeholder} />
      </Form.Item>
    );
  }
  return (
    <Form.Item name={field.id} label={field.label} rules={[{ required: true, message: "Required" }]}>
      <Input placeholder={field.placeholder} />
    </Form.Item>
  );
}

export function AppSettingsFields({ app, form }) {
  if (app.key === "facebook-pixel") return <PixelSetup key={app.id} form={form} />;
  return (app.settingsSchema || []).map((field) => <SettingsField key={field.id} field={field} />);
}
