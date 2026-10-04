"use client";

import { useState } from "react";
import { Upload, Button, App } from "antd";
import { Upload as UploadIcon, X, Images } from "lucide-react";
import { IMAGE_ACCEPT, uploadImage } from "@/lib/uploads";
import { MediaLibraryModal } from "./MediaLibraryModal";

/** An image picked by uploading it to the Files library — for antd Form
 * items (value = the image URL, "" when none). `aspect` sets the preview
 * shape, e.g. "16 / 9" for a blog cover or "1200 / 630" for a share image. */
export function ImageUploadField({ value, onChange, aspect = "16 / 9", label = "Upload image" }) {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const library = <MediaLibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} onSelect={(url) => onChange?.(url)} />;

  async function handleUpload(file) {
    setUploading(true);
    try {
      const uploaded = await uploadImage(file);
      onChange?.(uploaded.url);
    } catch (err) {
      message.error(err.message);
    } finally {
      setUploading(false);
    }
    return false;
  }

  if (value) {
    return (
      <div className="relative">
        <img src={value} alt="" className="w-full rounded-lg border border-app-border object-cover bg-app-bg" style={{ aspectRatio: aspect }} />
        <div className="flex gap-2 mt-2">
          <Upload accept={IMAGE_ACCEPT} showUploadList={false} beforeUpload={handleUpload} disabled={uploading}>
            <Button size="small" loading={uploading}>
              Replace
            </Button>
          </Upload>
          <Button size="small" icon={<Images size={14} aria-hidden="true" />} onClick={() => setLibraryOpen(true)}>
            Library
          </Button>
          <Button size="small" type="text" icon={<X size={14} aria-hidden="true" />} onClick={() => onChange?.("")}>
            Remove
          </Button>
        </div>
        {library}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
    <Upload.Dragger accept={IMAGE_ACCEPT} showUploadList={false} beforeUpload={handleUpload} disabled={uploading} className="!bg-app-bg">
      <div className="flex flex-col items-center gap-2 py-4">
        <UploadIcon size={18} className="text-ink-muted" aria-hidden="true" />
        <span className="text-sm font-medium text-ink">{uploading ? "Uploading…" : label}</span>
        <span className="text-xs text-ink-muted">PNG, JPG, WebP or GIF</span>
      </div>
    </Upload.Dragger>
      <Button size="small" icon={<Images size={14} aria-hidden="true" />} onClick={() => setLibraryOpen(true)}>
        Choose from Files
      </Button>
      {library}
    </div>
  );
}
