"use client";

import { useState } from "react";
import { Drawer, Tabs, Button, Select } from "antd";
import { Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { useEditorStore } from "./store";
import { SettingsFieldList } from "./SettingField";
import { hydrateGlobalSectionDefaults, newBlockId, defaultBlockSettings } from "./schema-utils";

const GLOBAL_SECTION_TYPES = [
  { key: "announcement-bar", label: "Announcement bar" },
  { key: "header", label: "Header" },
  { key: "footer", label: "Footer" },
];

/**
 * Header/footer/announcement-bar live outside any template (they render
 * on every page via `{% section %}` in layout.liquid), so they don't show
 * up in the per-template SectionList + SettingsPanel — this is their own
 * settings surface, same schema-driven fields, writing to
 * settingsData.sections[type] instead of the draft template.
 */
export function GlobalSectionsDrawer({ open, onClose, catalog, products, collections, menus }) {
  const [activeType, setActiveType] = useState("header");
  const settingsData = useEditorStore((s) => s.settingsData);
  const updateGlobalSectionSetting = useEditorStore((s) => s.updateGlobalSectionSetting);
  const addGlobalSectionBlock = useEditorStore((s) => s.addGlobalSectionBlock);
  const removeGlobalSectionBlock = useEditorStore((s) => s.removeGlobalSectionBlock);
  const updateGlobalSectionBlockSetting = useEditorStore((s) => s.updateGlobalSectionBlockSetting);
  const moveGlobalSectionBlock = useEditorStore((s) => s.moveGlobalSectionBlock);

  return (
    <Drawer title="Global sections" open={open} onClose={onClose} width={400}>
      <Tabs
        activeKey={activeType}
        onChange={setActiveType}
        items={GLOBAL_SECTION_TYPES.filter((t) => catalog[t.key]).map((t) => ({ key: t.key, label: t.label }))}
      />
      {GLOBAL_SECTION_TYPES.map((t) => {
        if (t.key !== activeType || !catalog[t.key]) return null;
        const schema = catalog[t.key];
        const { settings, blocks, block_order: blockOrder } = hydrateGlobalSectionDefaults(
          catalog,
          t.key,
          settingsData.sections?.[t.key]
        );
        const blockTypes = schema.blocks || [];

        return (
          <div key={t.key} className="flex flex-col gap-4">
            <SettingsFieldList
              settings={schema.settings || []}
              values={settings}
              products={products}
              collections={collections}
              menus={menus}
              onChange={(settingId, value) => updateGlobalSectionSetting(t.key, settingId, value)}
            />

            {blockTypes.length > 0 && (
              <div className="border-t border-app-border pt-4 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold uppercase text-ink-muted m-0">Blocks</h4>
                  {(!schema.max_blocks || blockOrder.length < schema.max_blocks) && (
                    <Select
                      size="small"
                      placeholder="+ Add block"
                      className="w-36"
                      value={null}
                      options={blockTypes.map((b) => ({ value: b.type, label: b.name }))}
                      onChange={(blockType) =>
                        addGlobalSectionBlock(t.key, newBlockId(), blockType, defaultBlockSettings(catalog, t.key, blockType))
                      }
                    />
                  )}
                </div>

                {blockOrder.length === 0 && <p className="text-xs text-ink-muted">No blocks yet.</p>}

                <div className="flex flex-col gap-3">
                  {blockOrder.map((blockId, idx) => {
                    const block = blocks[blockId];
                    const blockSchema = blockTypes.find((b) => b.type === block.type);
                    return (
                      <div key={blockId} className="border border-app-border rounded-md p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium">{blockSchema?.name || block.type}</span>
                          <div className="flex gap-1">
                            <Button
                              size="small"
                              type="text"
                              icon={<ChevronUp size={12} aria-hidden="true" />}
                              aria-label="Move block up"
                              disabled={idx === 0}
                              onClick={() => moveGlobalSectionBlock(t.key, blockId, -1)}
                            />
                            <Button
                              size="small"
                              type="text"
                              icon={<ChevronDown size={12} aria-hidden="true" />}
                              aria-label="Move block down"
                              disabled={idx === blockOrder.length - 1}
                              onClick={() => moveGlobalSectionBlock(t.key, blockId, 1)}
                            />
                            <Button
                              size="small"
                              type="text"
                              danger
                              icon={<Trash2 size={12} aria-hidden="true" />}
                              aria-label="Remove block"
                              onClick={() => removeGlobalSectionBlock(t.key, blockId)}
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <SettingsFieldList
                            settings={blockSchema?.settings || []}
                            values={block.settings}
                            products={products}
                            collections={collections}
                            menus={menus}
                            onChange={(settingId, value) => updateGlobalSectionBlockSetting(t.key, blockId, settingId, value)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </Drawer>
  );
}
