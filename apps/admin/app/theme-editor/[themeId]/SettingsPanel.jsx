"use client";

import { useState } from "react";
import { Button, Dropdown, Tooltip } from "antd";
import { Trash2, ChevronUp, ChevronDown, ChevronRight, Plus, MousePointerClick, Settings2, PanelTop, Eye, EyeOff } from "lucide-react";
import { useEditorStore } from "./store";
import { SettingsFieldList } from "./SettingField";
import { defaultBlockSettings, newBlockId } from "./schema-utils";
import { sectionMeta } from "./section-meta";

// What a block is called in its row: its own text if it has any
// ("Free shipping over ₹999"), else its type ("Message").
function blockLabel(block, blockSchema) {
  const s = block.settings || {};
  const text = s.title || s.heading || s.text || s.question || s.name || s.quote || s.author || s.value || "";
  return String(text).replace(/<[^>]+>/g, "").slice(0, 48) || blockSchema?.name || block.type;
}

function Guide({ onOpenSettings, onOpenGlobal }) {
  return (
    <div className="p-5 flex flex-col gap-4">
      <span className="w-10 h-10 rounded-lg bg-accent-soft text-accent flex items-center justify-center">
        <MousePointerClick size={18} aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-semibold text-ink m-0">Customize your home page</p>
        <p className="text-[13px] text-ink-muted mt-1 mb-0">Click any section in the preview or in the list on the left to change its text, images and layout.</p>
      </div>
      <ol className="m-0 pl-4 text-[13px] text-ink-muted flex flex-col gap-1.5">
        <li>Pick a section, then edit it here.</li>
        <li>Add blocks (slides, questions, reviews…) inside a section.</li>
        <li>Drag sections to change their order, or hide ones you don't need.</li>
      </ol>
      <div className="flex flex-col gap-2 pt-2 border-t border-app-border">
        <Button icon={<Settings2 size={14} aria-hidden="true" />} onClick={onOpenSettings} className="!justify-start">
          Colours, fonts &amp; cart
        </Button>
        <Button icon={<PanelTop size={14} aria-hidden="true" />} onClick={onOpenGlobal} className="!justify-start">
          Header, footer &amp; announcement
        </Button>
      </div>
    </div>
  );
}

export function SettingsPanel({ catalog, products, collections, menus, onOpenSettings, onOpenGlobal }) {
  const template = useEditorStore((s) => s.template);
  const selectedSectionKey = useEditorStore((s) => s.selectedSectionKey);
  const selectSection = useEditorStore((s) => s.selectSection);
  const updateSectionSetting = useEditorStore((s) => s.updateSectionSetting);
  const toggleSectionDisabled = useEditorStore((s) => s.toggleSectionDisabled);
  const addBlock = useEditorStore((s) => s.addBlock);
  const removeBlock = useEditorStore((s) => s.removeBlock);
  const updateBlockSetting = useEditorStore((s) => s.updateBlockSetting);
  const moveBlock = useEditorStore((s) => s.moveBlock);
  const [openBlock, setOpenBlock] = useState(null);

  if (!selectedSectionKey || !template.sections[selectedSectionKey]) {
    return <Guide onOpenSettings={onOpenSettings} onOpenGlobal={onOpenGlobal} />;
  }

  const entry = template.sections[selectedSectionKey];
  const schema = catalog[entry.type];
  if (!schema) {
    return <div className="p-6 text-sm text-ink-muted">Unknown section type: {entry.type}</div>;
  }

  const meta = sectionMeta(entry.type);
  const Icon = meta.icon;
  const blockOrder = entry.block_order || [];
  const blockTypes = schema.blocks || [];
  const canAddBlock = blockTypes.length > 0 && (!schema.max_blocks || blockOrder.length < schema.max_blocks);

  function add(type) {
    const id = newBlockId();
    addBlock(selectedSectionKey, id, type, defaultBlockSettings(catalog, entry.type, type));
    setOpenBlock(id);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-app-border flex items-start gap-3">
        <span className="w-8 h-8 rounded-md bg-app-bg text-ink flex items-center justify-center shrink-0">
          <Icon size={16} aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink m-0 truncate">{schema.name}</p>
          <p className="text-[11.5px] text-ink-muted m-0 leading-snug">{meta.text}</p>
        </div>
        <Tooltip title={entry.disabled ? "Show section" : "Hide section"}>
          <Button
            size="small"
            type="text"
            icon={entry.disabled ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
            aria-label={entry.disabled ? "Show section" : "Hide section"}
            onClick={() => toggleSectionDisabled(selectedSectionKey)}
          />
        </Tooltip>
        <Button size="small" type="text" aria-label="Close" onClick={() => selectSection(null)}>
          Done
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {entry.disabled && <p className="m-0 text-xs rounded-md bg-app-bg px-3 py-2 text-ink-muted">This section is hidden — shoppers don't see it.</p>}
        <SettingsFieldList
          settings={schema.settings || []}
          values={entry.settings}
          products={products}
          collections={collections}
          menus={menus}
          onChange={(settingId, value) => updateSectionSetting(selectedSectionKey, settingId, value)}
        />

        {blockTypes.length > 0 && (
          <div className="border-t border-app-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted m-0">
                {blockTypes.length === 1 ? `${blockTypes[0].name}s` : "Content blocks"}
                <span className="font-normal normal-case tracking-normal"> · {blockOrder.length}</span>
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              {blockOrder.map((blockId, idx) => {
                const block = entry.blocks[blockId];
                if (!block) return null;
                const blockSchema = blockTypes.find((b) => b.type === block.type);
                const open = openBlock === blockId;
                return (
                  <div key={blockId} className={`rounded-lg border ${open ? "border-accent" : "border-app-border"} bg-app-surface`}>
                    <div className="flex items-center gap-1 pl-2 pr-1">
                      <button
                        type="button"
                        className="flex-1 min-w-0 flex items-center gap-1.5 py-2 text-left bg-transparent border-0 cursor-pointer"
                        aria-expanded={open}
                        onClick={() => setOpenBlock(open ? null : blockId)}
                      >
                        <ChevronRight size={13} className={`text-ink-subtle shrink-0 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
                        <span className="text-[13px] text-ink truncate">{blockLabel(block, blockSchema)}</span>
                      </button>
                      <Button size="small" type="text" icon={<ChevronUp size={12} aria-hidden="true" />} aria-label="Move up" disabled={idx === 0} onClick={() => moveBlock(selectedSectionKey, blockId, -1)} />
                      <Button size="small" type="text" icon={<ChevronDown size={12} aria-hidden="true" />} aria-label="Move down" disabled={idx === blockOrder.length - 1} onClick={() => moveBlock(selectedSectionKey, blockId, 1)} />
                      <Tooltip title={blockOrder.length === 1 && schema.default_blocks ? "A section needs at least one — hide the section instead" : "Remove"}>
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<Trash2 size={12} aria-hidden="true" />}
                          aria-label="Remove"
                          disabled={blockOrder.length === 1 && Boolean(schema.default_blocks)}
                          onClick={() => removeBlock(selectedSectionKey, blockId)}
                        />
                      </Tooltip>
                    </div>
                    {open && (
                      <div className="flex flex-col gap-3 px-3 pb-3 pt-1 border-t border-app-border">
                        <SettingsFieldList
                          settings={blockSchema?.settings || []}
                          values={block.settings}
                          products={products}
                          collections={collections}
                          menus={menus}
                          onChange={(settingId, value) => updateBlockSetting(selectedSectionKey, blockId, settingId, value)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {canAddBlock &&
              (blockTypes.length === 1 ? (
                <Button type="dashed" block size="small" className="mt-2" icon={<Plus size={13} aria-hidden="true" />} onClick={() => add(blockTypes[0].type)}>
                  Add {blockTypes[0].name.toLowerCase()}
                </Button>
              ) : (
                <Dropdown trigger={["click"]} menu={{ items: blockTypes.map((b) => ({ key: b.type, label: b.name, onClick: () => add(b.type) })) }}>
                  <Button type="dashed" block size="small" className="mt-2" icon={<Plus size={13} aria-hidden="true" />}>
                    Add block
                  </Button>
                </Dropdown>
              ))}
            {!canAddBlock && blockTypes.length > 0 && <p className="text-[11px] text-ink-muted mt-2 mb-0">This section holds up to {schema.max_blocks}.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
