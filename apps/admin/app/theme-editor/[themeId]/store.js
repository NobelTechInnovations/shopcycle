"use client";

import { create } from "zustand";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * All visual-editor state lives here: the draft template (sections + order,
 * unsaved), the draft theme settings, and an undo/redo history of template
 * snapshots. Nothing here talks to the network — EditorView wires this
 * store's `dirty` flag to a debounced autosave and to the live-preview
 * re-render.
 */
export const useEditorStore = create((set, get) => ({
  template: null,
  settingsData: {},
  selectedSectionKey: null,
  history: [],
  future: [],
  dirty: false,
  savedAt: null,

  init: (template, settingsData) =>
    set({
      template: clone(template),
      settingsData: clone(settingsData || {}),
      history: [],
      future: [],
      dirty: false,
      selectedSectionKey: null,
    }),

  selectSection: (key) => set({ selectedSectionKey: key }),

  /** Every template mutation goes through here so undo/redo and the dirty
   * flag never drift out of sync with each other. */
  _commit: (mutator) => {
    const { template, history } = get();
    const next = clone(template);
    mutator(next);
    set({ template: next, history: [...history, template], future: [], dirty: true });
  },

  undo: () => {
    const { history, future, template } = get();
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    set({ template: prev, history: history.slice(0, -1), future: [template, ...future], dirty: true });
  },

  redo: () => {
    const { history, future, template } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({ template: next, future: future.slice(1), history: [...history, template], dirty: true });
  },

  updateSectionSetting: (key, settingId, value) =>
    get()._commit((t) => {
      t.sections[key].settings[settingId] = value;
    }),

  addSection: (key, type, defaultSettings) =>
    get()._commit((t) => {
      t.sections[key] = { type, settings: defaultSettings, blocks: {}, block_order: [] };
      t.order.push(key);
    }),

  removeSection: (key) =>
    get()._commit((t) => {
      delete t.sections[key];
      t.order = t.order.filter((k) => k !== key);
    }),

  duplicateSection: (key, newKey) =>
    get()._commit((t) => {
      t.sections[newKey] = clone(t.sections[key]);
      const idx = t.order.indexOf(key);
      t.order.splice(idx + 1, 0, newKey);
    }),

  toggleSectionDisabled: (key) =>
    get()._commit((t) => {
      t.sections[key].disabled = !t.sections[key].disabled;
    }),

  reorderSections: (fromIndex, toIndex) =>
    get()._commit((t) => {
      const [moved] = t.order.splice(fromIndex, 1);
      t.order.splice(toIndex, 0, moved);
    }),

  addBlock: (sectionKey, blockId, blockType, defaultSettings) =>
    get()._commit((t) => {
      const section = t.sections[sectionKey];
      section.blocks = section.blocks || {};
      section.block_order = section.block_order || [];
      section.blocks[blockId] = { type: blockType, settings: defaultSettings };
      section.block_order.push(blockId);
    }),

  removeBlock: (sectionKey, blockId) =>
    get()._commit((t) => {
      const section = t.sections[sectionKey];
      delete section.blocks[blockId];
      section.block_order = section.block_order.filter((id) => id !== blockId);
    }),

  updateBlockSetting: (sectionKey, blockId, settingId, value) =>
    get()._commit((t) => {
      t.sections[sectionKey].blocks[blockId].settings[settingId] = value;
    }),

  /** Simple up/down reordering rather than a second nested drag-and-drop
   * context inside the settings panel — full drag support lives one level
   * up, on the section list itself. */
  moveBlock: (sectionKey, blockId, direction) =>
    get()._commit((t) => {
      const order = t.sections[sectionKey].block_order;
      const idx = order.indexOf(blockId);
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= order.length) return;
      [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    }),

  updateThemeSetting: (settingId, value) =>
    set((s) => ({ settingsData: { ...s.settingsData, [settingId]: value }, dirty: true })),

  /**
   * "Global sections" — header/footer/announcement-bar. These render via
   * `{% section %}` from layout.liquid on every page, not from a template's
   * section list, so their settings/blocks live in a different place than
   * a homepage section's: `settingsData.sections[type]` (see
   * liquid-engine.js's SectionTag, which reads exactly this shape) rather
   * than `template.sections[key]`. Same mutation shape either way — these
   * mirror updateSectionSetting/addBlock/removeBlock/updateBlockSetting,
   * just targeting settingsData instead of the draft template.
   */
  updateGlobalSectionSetting: (sectionType, settingId, value) =>
    set((s) => {
      const sections = clone(s.settingsData.sections || {});
      sections[sectionType] = sections[sectionType] || {};
      sections[sectionType][settingId] = value;
      return { settingsData: { ...s.settingsData, sections }, dirty: true };
    }),

  addGlobalSectionBlock: (sectionType, blockId, blockType, defaultSettings) =>
    set((s) => {
      const sections = clone(s.settingsData.sections || {});
      sections[sectionType] = sections[sectionType] || {};
      sections[sectionType].blocks = sections[sectionType].blocks || {};
      sections[sectionType].block_order = sections[sectionType].block_order || [];
      sections[sectionType].blocks[blockId] = { type: blockType, settings: defaultSettings };
      sections[sectionType].block_order.push(blockId);
      return { settingsData: { ...s.settingsData, sections }, dirty: true };
    }),

  removeGlobalSectionBlock: (sectionType, blockId) =>
    set((s) => {
      const sections = clone(s.settingsData.sections || {});
      delete sections[sectionType].blocks[blockId];
      sections[sectionType].block_order = sections[sectionType].block_order.filter((id) => id !== blockId);
      return { settingsData: { ...s.settingsData, sections }, dirty: true };
    }),

  updateGlobalSectionBlockSetting: (sectionType, blockId, settingId, value) =>
    set((s) => {
      const sections = clone(s.settingsData.sections || {});
      sections[sectionType].blocks[blockId].settings[settingId] = value;
      return { settingsData: { ...s.settingsData, sections }, dirty: true };
    }),

  moveGlobalSectionBlock: (sectionType, blockId, direction) =>
    set((s) => {
      const sections = clone(s.settingsData.sections || {});
      const order = sections[sectionType].block_order;
      const idx = order.indexOf(blockId);
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= order.length) return {};
      [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
      return { settingsData: { ...s.settingsData, sections }, dirty: true };
    }),

  markSaved: () => set({ dirty: false, savedAt: Date.now() }),
}));
