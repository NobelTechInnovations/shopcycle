"use client";

import { useState } from "react";
import { App, Button, Input, Upload } from "antd";
import { ImagePlus, Images, Link2, Trash2 } from "lucide-react";
import { MediaLibraryModal } from "@/components/MediaLibraryModal";
import { IMAGE_ACCEPT, uploadImage } from "@/lib/uploads";

/** One image as a Form field (value = URL): drop or upload a file, pick
 * from Files, or paste a link. */
export function ImageUploadField({ value, onChange, hint = "Square images look best — 800 × 800 px or larger." }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [library, setLibrary] = useState(false);
  const [pasting, setPasting] = useState(false);

  async function upload(file) {
    setBusy(true);
    try {
      const f = await uploadImage(file);
      onChange?.(f.url);
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(false);
    }
    return false;
  }

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className="flex items-center gap-4">
          <img src={value} alt="" className="h-28 w-28 rounded-xl border border-app-border bg-app-bg object-contain" />
          <div className="flex flex-col gap-2">
            <Upload accept={IMAGE_ACCEPT} showUploadList={false} beforeUpload={upload}>
              <Button size="small" icon={<ImagePlus size={13} aria-hidden="true" />} loading={busy}>
                Replace
              </Button>
            </Upload>
            <Button size="small" icon={<Images size={13} aria-hidden="true" />} onClick={() => setLibrary(true)}>
              Choose from Files
            </Button>
            <Button size="small" type="text" danger icon={<Trash2 size={13} aria-hidden="true" />} onClick={() => onChange?.(null)}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Upload.Dragger accept={IMAGE_ACCEPT} showUploadList={false} beforeUpload={upload} disabled={busy} style={{ padding: "8px 0" }}>
          <div className="flex flex-col items-center gap-1.5 py-2 text-ink-muted">
            <ImagePlus size={22} aria-hidden="true" />
            <span className="text-[13px] text-ink">{busy ? "Uploading…" : "Drop an image here, or click to upload"}</span>
            <span className="text-[12px]">{hint}</span>
          </div>
        </Upload.Dragger>
      )}
      {!value && (
        <div className="flex flex-wrap gap-2">
          <Button size="small" icon={<Images size={13} aria-hidden="true" />} onClick={() => setLibrary(true)}>
            Choose from Files
          </Button>
          <Button size="small" type="text" icon={<Link2 size={13} aria-hidden="true" />} onClick={() => setPasting((v) => !v)}>
            Paste a link
          </Button>
        </div>
      )}
      {pasting && !value && <Input placeholder="https://…" onPressEnter={(e) => e.currentTarget.value && (onChange?.(e.currentTarget.value.trim()), setPasting(false))} onBlur={(e) => e.currentTarget.value && (onChange?.(e.currentTarget.value.trim()), setPasting(false))} />}
      <MediaLibraryModal
        open={library}
        onClose={() => setLibrary(false)}
        onSelect={(urls) => {
          if (urls?.[0]) onChange?.(urls[0]);
          setLibrary(false);
        }}
      />
    </div>
  );
}
