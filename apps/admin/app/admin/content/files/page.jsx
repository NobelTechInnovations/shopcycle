"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Upload, App } from "antd";
import { UploadCloud, Trash2, Folder } from "lucide-react";
import { PageHeader, EmptyState, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch, apiUpload } from "@/lib/api";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ContentFilesPage() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/files?pageSize=100");
      setFiles(data.files);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(file) {
    setUploading(true);
    try {
      await apiUpload("/api/files/upload", file);
      await load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setUploading(false);
    }
    return false;
  }

  function handleDelete(file) {
    confirmDialog({
      title: `Delete "${file.name}"?`,
      description: "This can't be undone. Any product still referencing this image will show a broken image.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/files/${file.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  return (
    <div>
      <PageHeader
        title="Files"
        actions={
          <Upload showUploadList={false} beforeUpload={handleUpload} accept="image/*">
            <Button type="primary" loading={uploading} icon={<UploadCloud size={14} aria-hidden="true" />}>
              Upload
            </Button>
          </Upload>
        }
      />

      {!loading && files.length === 0 && (
        <div className="bg-app-surface border border-app-border rounded-md">
          <EmptyState
            icon={<Folder size={32} strokeWidth={1.5} />}
            title="No files yet"
            description="Upload images to use across products, collections, and theme sections."
          />
        </div>
      )}

      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          {files.map((file) => (
            <div key={file.id} className="group relative border border-app-border rounded-md overflow-hidden bg-app-surface">
              <div className="aspect-square bg-app-bg flex items-center justify-center overflow-hidden">
                <img src={file.url} alt={file.name} className="object-cover w-full h-full" />
              </div>
              <div className="p-2">
                <p className="text-xs truncate m-0" title={file.name}>{file.name}</p>
                <p className="text-[11px] text-ink-muted m-0">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                className="absolute top-1 right-1 bg-app-surface border border-app-border rounded-md p-1 opacity-0 group-hover:opacity-100 text-status-danger"
                aria-label={`Delete ${file.name}`}
                onClick={() => handleDelete(file)}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
