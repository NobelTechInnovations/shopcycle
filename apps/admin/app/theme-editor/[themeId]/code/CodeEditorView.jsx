"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Select, Alert, App } from "antd";
import { ArrowLeft, History, Save } from "lucide-react";
import { useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { FileTree } from "./FileTree";
import { MonacoEditorPane } from "./MonacoEditorPane";
import { NewFileModal } from "./NewFileModal";
import { RevisionsDrawer } from "./RevisionsDrawer";
import { CodePreviewFrame } from "./CodePreviewFrame";

const TEMPLATE_OPTIONS = [
  { value: "index", label: "Home" },
  { value: "product", label: "Product" },
  { value: "collection", label: "Collection" },
];

export function CodeEditorView({ theme }) {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();

  const [files, setFiles] = useState(theme.files);
  const [selectedFile, setSelectedFile] = useState(
    theme.files.find((f) => f.path === "layout/theme.liquid") || theme.files[0] || null
  );
  const [content, setContent] = useState(selectedFile?.content || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [newFileModalOpen, setNewFileModalOpen] = useState(false);
  const [revisionsFile, setRevisionsFile] = useState(null);
  const [templateName, setTemplateName] = useState("index");
  const [products, setProducts] = useState([]);
  const [collections, setCollections] = useState([]);

  const dirty = selectedFile ? content !== selectedFile.content : false;

  // Keyboard-bound save (Cmd/Ctrl+S) is registered once per Monaco mount —
  // reading through a ref instead of closing over `content`/`selectedFile`
  // directly avoids the classic stale-closure bug where the shortcut keeps
  // saving whatever the file/content were at the moment it was bound.
  const stateRef = useRef();
  stateRef.current = { content, selectedFile, theme };

  useEffect(() => {
    apiFetch("/api/products?pageSize=100").then((d) => setProducts(d.products.filter((p) => p.status === "active")));
    apiFetch("/api/collections?pageSize=100").then((d) =>
      setCollections(d.collections.filter((c) => c.status === "active"))
    );
  }, []);

  async function trySave() {
    const { content, selectedFile, theme } = stateRef.current;
    if (!selectedFile || content === selectedFile.content) return true;
    setSaving(true);
    setSaveError(null);
    try {
      const { file } = await apiFetch(`/api/themes/${theme.id}/files`, {
        method: "PATCH",
        body: { path: selectedFile.path, content },
      });
      setFiles((prev) => prev.map((f) => (f.id === file.id ? file : f)));
      setSelectedFile(file);
      return true;
    } catch (err) {
      setSaveError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Debounced autosave — an invalid save just leaves the error banner up
  // and the last known-good version persisted; it doesn't retry-loop
  // destructively or lose the user's in-progress edit.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(trySave, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  async function handleSelectFile(file) {
    if (file.id === selectedFile?.id) return;
    const ok = await trySave();
    if (!ok) {
      message.error("Fix the error in the current file before switching — your edit hasn't been lost.");
      return;
    }
    setSelectedFile(file);
    setContent(file.content);
    setSaveError(null);
  }

  function handleEditorMount(editor, monaco) {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      trySave();
    });
  }

  async function handleCreateFile(path) {
    try {
      const { file } = await apiFetch(`/api/themes/${theme.id}/files`, {
        method: "POST",
        body: { path, content: "" },
      });
      setFiles((prev) => [...prev, file]);
      setSelectedFile(file);
      setContent(file.content);
      setNewFileModalOpen(false);
    } catch (err) {
      message.error(err.message);
    }
  }

  function handleRename(file) {
    const currentName = file.path.split("/").pop();
    const folder = file.path.split("/").slice(0, -1).join("/");
    let newName = currentName;
    confirmDialog({
      title: `Rename "${currentName}"`,
      description: (
        <input
          defaultValue={currentName}
          autoFocus
          className="w-full mt-2 px-2 py-1 border border-app-border rounded-md text-sm"
          onChange={(e) => (newName = e.target.value)}
        />
      ),
      okText: "Rename",
      onConfirm: async () => {
        try {
          const { file: renamed } = await apiFetch(`/api/themes/${theme.id}/files/${file.id}/rename`, {
            method: "PATCH",
            body: { newPath: `${folder}/${newName}` },
          });
          setFiles((prev) => prev.map((f) => (f.id === renamed.id ? renamed : f)));
          if (selectedFile?.id === renamed.id) setSelectedFile(renamed);
        } catch (err) {
          message.error(err.message);
        }
      },
    });
  }

  function handleDelete(file) {
    confirmDialog({
      title: `Delete "${file.path.split("/").pop()}"?`,
      description: "This can't be undone.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/themes/${theme.id}/files/${file.id}`, { method: "DELETE" });
        setFiles((prev) => prev.filter((f) => f.id !== file.id));
        if (selectedFile?.id === file.id) {
          const next = files.find((f) => f.id !== file.id) || null;
          setSelectedFile(next);
          setContent(next?.content || "");
        }
      },
    });
  }

  function handleRestore(restoredFile) {
    setFiles((prev) => prev.map((f) => (f.id === restoredFile.id ? restoredFile : f)));
    if (selectedFile?.id === restoredFile.id) {
      setSelectedFile(restoredFile);
      setContent(restoredFile.content);
    }
    setRevisionsFile(null);
    message.success("Restored");
  }

  const previewSlug =
    templateName === "product" ? products[0]?.slug : templateName === "collection" ? collections[0]?.slug : undefined;

  return (
    <div className="flex flex-col h-screen bg-app-bg">
      <div className="flex items-center justify-between px-4 py-2 border-b border-app-border bg-app-surface shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/admin/online-store/themes" className="text-ink-muted hover:text-ink" aria-label="Back to themes">
            <ArrowLeft size={16} aria-hidden="true" />
          </Link>
          <span className="text-sm font-semibold">{theme.name} — Code</span>
          <Select size="small" className="w-32" value={templateName} onChange={setTemplateName} options={TEMPLATE_OPTIONS} aria-label="Preview template" />
        </div>
        <div className="flex items-center gap-2">
          {selectedFile && (
            <Button size="small" icon={<History size={14} aria-hidden="true" />} onClick={() => setRevisionsFile(selectedFile)}>
              History
            </Button>
          )}
          <span className="text-xs text-ink-muted w-20 text-center" aria-live="polite">
            {saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}
          </span>
          <Button size="small" type="primary" icon={<Save size={14} aria-hidden="true" />} loading={saving} onClick={trySave}>
            Save
          </Button>
        </div>
      </div>

      {saveError && (
        <Alert type="error" message={saveError} banner closable onClose={() => setSaveError(null)} />
      )}

      <div className="flex flex-1 min-h-0">
        <div className="w-64 shrink-0 border-r border-app-border bg-app-surface">
          <FileTree
            files={files}
            selectedId={selectedFile?.id}
            isDirty={dirty}
            onSelect={handleSelectFile}
            onNewFile={() => setNewFileModalOpen(true)}
            onRename={handleRename}
            onDelete={handleDelete}
          />
        </div>

        <div className="flex-1 min-w-0 border-r border-app-border">
          {selectedFile ? (
            <MonacoEditorPane path={selectedFile.path} value={content} onChange={setContent} onMount={handleEditorMount} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-ink-muted">No file selected</div>
          )}
        </div>

        <div className="w-[420px] shrink-0">
          {selectedFile && (
            <CodePreviewFrame
              themeId={theme.id}
              templateName={templateName}
              previewSlug={previewSlug}
              filePath={selectedFile.path}
              fileContent={content}
            />
          )}
        </div>
      </div>

      <NewFileModal open={newFileModalOpen} onClose={() => setNewFileModalOpen(false)} onCreate={handleCreateFile} />
      <RevisionsDrawer themeId={theme.id} file={revisionsFile} onClose={() => setRevisionsFile(null)} onRestore={handleRestore} />
    </div>
  );
}
