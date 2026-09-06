"use client";

import { Drawer } from "antd";
import { useEditorStore } from "./store";
import { SettingField } from "./SettingField";

export function ThemeSettingsDrawer({ open, onClose, schemaGroups }) {
  const settingsData = useEditorStore((s) => s.settingsData);
  const updateThemeSetting = useEditorStore((s) => s.updateThemeSetting);

  return (
    <Drawer title="Theme settings" open={open} onClose={onClose} width={360}>
      {schemaGroups.map((group) => (
        <div key={group.name} className="mb-6">
          <h4 className="text-xs font-semibold uppercase text-ink-muted mb-3">{group.name}</h4>
          {group.settings.map((setting) => (
            <div key={setting.id} className="mb-3">
              <label className="block text-xs font-medium text-ink-muted mb-1">{setting.label}</label>
              <SettingField
                setting={setting}
                value={settingsData[setting.id]}
                onChange={(value) => updateThemeSetting(setting.id, value)}
              />
            </div>
          ))}
        </div>
      ))}
    </Drawer>
  );
}
