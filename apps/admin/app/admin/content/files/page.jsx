"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Upload, App, Skeleton } from "antd";
import { UploadCloud, Trash2, Link2, ImagePlus } from "lucide-react";
import { PageHeader, useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { IMAGE_ACCEPT, uploadImage } from "@/lib/uploads";

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
  const [uploading, setUploading] = useState(0); // files in flight

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
    setUploading((n) => n + 1);
    try {
      await uploadImage(file);
      await load();
    } catch (err) {
      message.error(`${file.name}: ${err.message}`);
    } finally {
      setUploading((n) => n - 1);
    }
    return false; // we upload ourselves; stop AntD's own request
  }

  async function copyLink(file) {
    try {
      await navigator.clipboard.writeText(file.url);
      message.success("Link copied");
    } catch {
      message.info(file.url);
    }
  }

  function handleDelete(file) {
    confirmDialog({
      title: `Delete "${file.name}"?`,
      description: "Any product or theme section still using this image will show it as missing. This can't be undone.",
      okText: "Delete",
      danger: true,
      onConfirm: async () => {
        await apiFetch(`/api/files/${file.id}`, { method: "DELETE" });
        load();
      },
    });
  }

  const uploadProps = { multiple: true, showUploadList: false, beforeUpload: handleUpload, accept: IMAGE_ACCEPT };

  return (
    <div>
      <PageHeader
        title="Files"
        subtitle={loading ? " " : `${files.length} ${files.length === 1 ? "image" : "images"} · JPEG, PNG, WebP, or GIF up to 8 MB`}
        actions={
          <Upload {...uploadProps}>
            <Button type="primary" loading={uploading > 0} icon={<UploadCloud size={15} aria-hidden="true" />}>
              Upload
            </Button>
          </Upload>
        }
      />

      <Upload.Dragger {...uploadProps} className="!block mb-5 [&_.ant-upload-drag]:!rounded-[14px] [&_.ant-upload-drag]:!bg-app-surface">
        <div className="flex flex-col items-center gap-2 py-4">
          <span className="w-11 h-11 rounded-xl bg-app-bg border border-app-border text-ink-muted flex items-center justify-center">
            <ImagePlus size={20} aria-hidden="true" />
          </span>
          <p className="text-sm text-ink m-0">
            <span className="font-medium">Drop images here</span> or click to choose
          </p>
          <p className="text-xs text-ink-muted m-0">{uploading > 0 ? `Uploading ${uploading}…` : "You can add several at once"}</p>
        </div>
      </Upload.Dragger>

      {loading && files.length === 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton.Image key={i} active className="!w-full !h-auto !aspect-square" />
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          {files.map((file) => (
            <div
              key={file.id}
              className="group relative border border-app-border rounded-xl overflow-hidden bg-app-surface shadow-card"
            >
              <div className="aspect-square bg-app-bg overflow-hidden">
                <img src={file.url} alt={file.name} className="object-cover w-full h-full" loading="lazy" />
              </div>
              <div className="px-2.5 py-2">
                <p className="text-xs font-medium text-ink truncate m-0" title={file.name}>
                  {file.name}
                </p>
                <p className="text-[11px] text-ink-muted m-0">{formatBytes(file.size)}</p>
              </div>
              <div className="flex border-t border-app-border">
                <button
                  type="button"
                  className="flex-1 h-8 inline-flex items-center justify-center gap-1.5 text-xs text-ink-muted hover:text-ink hover:bg-app-bg bg-transparent border-0 cursor-pointer"
                  aria-label={`Copy link to ${file.name}`}
                  onClick={() => copyLink(file)}
                >
                  <Link2 size={13} aria-hidden="true" /> Copy link
                </button>
                <button
                  type="button"
                  className="w-10 h-8 inline-flex items-center justify-center border-0 border-l border-solid border-app-border text-ink-muted hover:text-status-danger hover:bg-app-bg bg-transparent cursor-pointer"
                  aria-label={`Delete ${file.name}`}
                  title="Delete"
                  onClick={() => handleDelete(file)}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
