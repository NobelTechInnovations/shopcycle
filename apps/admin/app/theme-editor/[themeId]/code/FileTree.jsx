"use client";

import { useMemo, useState } from "react";
import { Button, Dropdown } from "antd";
import { ChevronRight, ChevronDown, FileCode, Plus, MoreVertical, Trash2, Pencil } from "lucide-react";

const FOLDER_ORDER = ["layout", "templates", "sections", "snippets", "config", "assets", "locales"];
const FOLDER_LABELS = {
  layout: "Layout",
  templates: "Templates",
  sections: "Sections",
  snippets: "Snippets",
  config: "Config",
  assets: "Assets",
  locales: "Locales",
};

function groupFiles(files) {
  const groups = {};
  for (const f of files) {
    const folder = f.path.split("/")[0];
    (groups[folder] ||= []).push(f);
  }
  for (const key of Object.keys(groups)) groups[key].sort((a, b) => a.path.localeCompare(b.path));
  return groups;
}

export function FileTree({ files, selectedId, isDirty, onSelect, onNewFile, onRename, onDelete }) {
  const groups = useMemo(() => groupFiles(files), [files]);
  const [collapsed, setCollapsed] = useState({});

  return (
    <div className="h-full overflow-y-auto p-2">
      <div className="flex items-center justify-between px-2 py-1 mb-1">
        <span className="text-xs font-semibold uppercase text-ink-muted">Theme files</span>
        <Button size="small" type="text" icon={<Plus size={13} aria-hidden="true" />} aria-label="New file" onClick={onNewFile} />
      </div>

      {FOLDER_ORDER.filter((folder) => groups[folder]?.length).map((folder) => (
        <div key={folder} className="mb-1">
          <button
            type="button"
            className="w-full flex items-center gap-1 px-2 py-1 text-xs font-medium text-ink-muted hover:bg-app-bg rounded"
            onClick={() => setCollapsed((c) => ({ ...c, [folder]: !c[folder] }))}
            aria-expanded={!collapsed[folder]}
          >
            {collapsed[folder] ? <ChevronRight size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
            {FOLDER_LABELS[folder] || folder}
          </button>

          {!collapsed[folder] && (
            <div className="ml-3">
              {groups[folder].map((file) => {
                const name = file.path.split("/").pop();
                const selected = selectedId === file.id;
                return (
                  <div
                    key={file.id}
                    role="button"
                    tabIndex={0}
                    className={`group flex items-center gap-1.5 px-2 py-1 rounded text-sm cursor-pointer ${
                      selected ? "bg-app-bg font-medium" : "hover:bg-app-bg"
                    }`}
                    onClick={() => onSelect(file)}
                    onKeyDown={(e) => e.key === "Enter" && onSelect(file)}
                  >
                    <FileCode size={13} className="text-ink-muted shrink-0" aria-hidden="true" />
                    <span className="flex-1 truncate">{name}</span>
                    {selected && isDirty && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-status-warning shrink-0"
                        role="status"
                        aria-label="Unsaved changes"
                      />
                    )}
                    <Dropdown
                      trigger={["click"]}
                      menu={{
                        items: [
                          { key: "rename", label: "Rename", icon: <Pencil size={12} aria-hidden="true" /> },
                          { key: "delete", label: "Delete", danger: true, icon: <Trash2 size={12} aria-hidden="true" /> },
                        ],
                        onClick: ({ key, domEvent }) => {
                          domEvent.stopPropagation();
                          if (key === "rename") onRename(file);
                          if (key === "delete") onDelete(file);
                        },
                      }}
                    >
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-ink-muted"
                        aria-label={`More actions for ${name}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical size={13} aria-hidden="true" />
                      </button>
                    </Dropdown>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
