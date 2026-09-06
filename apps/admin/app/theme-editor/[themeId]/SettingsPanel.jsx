"use client";

import { Button, Select } from "antd";
import { Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { useEditorStore } from "./store";
import { SettingsFieldList } from "./SettingField";
import { defaultBlockSettings, newBlockId } from "./schema-utils";

export function SettingsPanel({ catalog, products, collections, menus }) {
  const template = useEditorStore((s) => s.template);
  const selectedSectionKey = useEditorStore((s) => s.selectedSectionKey);
  const updateSectionSetting = useEditorStore((s) => s.updateSectionSetting);
  const addBlock = useEditorStore((s) => s.addBlock);
  const removeBlock = useEditorStore((s) => s.removeBlock);
  const updateBlockSetting = useEditorStore((s) => s.updateBlockSetting);
  const moveBlock = useEditorStore((s) => s.moveBlock);

  if (!selectedSectionKey || !template.sections[selectedSectionKey]) {
    return <div className="p-6 text-sm text-ink-muted text-center">Select a section to edit its settings.</div>;
  }

  const entry = template.sections[selectedSectionKey];
  const schema = catalog[entry.type];
  if (!schema) {
    return <div className="p-6 text-sm text-ink-muted">Unknown section type: {entry.type}</div>;
  }

  const blockOrder = entry.block_order || [];
  const blockTypes = schema.blocks || [];

  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto h-full">
      <h3 className="text-sm font-semibold m-0">{schema.name}</h3>

      <SettingsFieldList
        settings={schema.settings || []}
        values={entry.settings}
        products={products}
        collections={collections}
        menus={menus}
        onChange={(settingId, value) => updateSectionSetting(selectedSectionKey, settingId, value)}
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
                onChange={(type) =>
                  addBlock(selectedSectionKey, newBlockId(), type, defaultBlockSettings(catalog, entry.type, type))
                }
              />
            )}
          </div>

          {blockOrder.length === 0 && <p className="text-xs text-ink-muted">No blocks yet.</p>}

          <div className="flex flex-col gap-3">
            {blockOrder.map((blockId, idx) => {
              const block = entry.blocks[blockId];
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
                        onClick={() => moveBlock(selectedSectionKey, blockId, -1)}
                      />
                      <Button
                        size="small"
                        type="text"
                        icon={<ChevronDown size={12} aria-hidden="true" />}
                        aria-label="Move block down"
                        disabled={idx === blockOrder.length - 1}
                        onClick={() => moveBlock(selectedSectionKey, blockId, 1)}
                      />
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<Trash2 size={12} aria-hidden="true" />}
                        aria-label="Remove block"
                        onClick={() => removeBlock(selectedSectionKey, blockId)}
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
                      onChange={(settingId, value) => updateBlockSetting(selectedSectionKey, blockId, settingId, value)}
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
}
