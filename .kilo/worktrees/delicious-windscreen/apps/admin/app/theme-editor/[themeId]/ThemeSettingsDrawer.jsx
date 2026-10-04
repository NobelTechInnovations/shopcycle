"use client";

import { Drawer } from "antd";
import { useEditorStore } from "./store";
import { SettingField } from "./SettingField";

export function ThemeSettingsDrawer({ open, onClose, schemaGroups }) {
  const settingsData = useEditorStore((s) => s.settingsData);
  const updateThemeSetting = useEditorStore((s) => s.updateThemeSetting);

  return (
    <Drawer title="Theme settings" open={open} onClose={onClose} width={360}>
      <p className="text-[13px] text-ink-muted mt-0 mb-5">Fonts and colours apply to every page of your store, including product, cart and checkout.</p>
      {schemaGroups.map((group) => (
        <div key={group.name} className="mb-6">
          <h4 className="text-xs font-semibold uppercase text-ink-muted mb-3">{group.name}</h4>
          {group.settings.map((setting, i) =>
            setting.type === "paragraph" ? (
              <p key={`p-${i}`} className="text-xs text-ink-muted -mt-1 mb-3">{setting.content}</p>
            ) : setting.type === "header" ? (
              <div key={`h-${i}`} className="text-xs font-semibold text-ink mt-4 mb-2">{setting.content}</div>
            ) : (
              <div key={setting.id} className="mb-3">
                <label className="block text-xs font-medium text-ink-muted mb-1">{setting.label}</label>
                <SettingField setting={setting} value={settingsData[setting.id]} onChange={(value) => updateThemeSetting(setting.id, value)} />
              </div>
            )
          )}
        </div>
      ))}
    </Drawer>
  );
}
