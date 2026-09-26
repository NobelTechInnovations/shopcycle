"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, Input, Upload, Button, Empty, Skeleton, App } from "antd";
import { Search, UploadCloud, Check } from "lucide-react";
import { apiFetch, apiUpload } from "@/lib/api";
import { IMAGE_ACCEPT } from "@/lib/uploads";

/** Pick images already in Content ▸ Files (or upload new ones right here),
 * so one upload can be reused anywhere: theme sections, products, blog
 * covers, the SEO share image. `onSelect` gets the chosen URLs. */
export function MediaLibraryModal({ open, onClose, onSelect, multiple = false, max = 10 }) {
  const { message } = App.useApp();
  const [files, setFiles] = useState(null);
  const [picked, setPicked] = useState([]);
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(0);

  useEffect(() => {
    if (!open) return;
    setPicked([]);
    setQ("");
    apiFetch("/api/files?pageSize=100")
      .then((d) => setFiles(d.files))
      .catch((err) => {
        setFiles([]);
        message.error(err.message);
      });
  }, [open, message]);

  const shown = useMemo(() => (files || []).filter((f) => !q || String(f.name).toLowerCase().includes(q.toLowerCase())), [files, q]);

  function toggle(url) {
    if (!multiple) return setPicked([url]);
    setPicked((p) => (p.includes(url) ? p.filter((u) => u !== url) : p.length >= max ? p : [...p, url]));
  }

  async function upload(file) {
    setUploading((n) => n + 1);
    try {
      const { file: up } = await apiUpload("/api/files/upload", file);
      setFiles((list) => [up, ...(list || [])]);
      toggle(up.url);
    } catch (err) {
      message.error(err.message);
    } finally {
      setUploading((n) => n - 1);
    }
    return false;
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Choose image"
      width={760}
      destroyOnHidden
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-ink-muted">{picked.length ? `${picked.length} selected` : multiple ? `Select up to ${max}` : "Select one"}</span>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="primary"
              disabled={!picked.length}
              onClick={() => {
                onSelect(multiple ? picked : picked[0]);
                onClose();
              }}
            >
              {multiple ? "Add selected" : "Use image"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2 mb-4">
        <Input
          allowClear
          prefix={<Search size={14} className="text-ink-subtle" aria-hidden="true" />}
          placeholder="Search by file name"
          className="!flex-1 !min-w-[200px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Upload accept={IMAGE_ACCEPT} multiple={multiple} showUploadList={false} beforeUpload={upload}>
          <Button icon={<UploadCloud size={14} aria-hidden="true" />} loading={uploading > 0}>
            Upload new
          </Button>
        </Upload>
      </div>

      {files === null ? (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton.Image key={i} active className="!w-full !h-auto !aspect-square" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Empty description={q ? "No images match" : "No images yet — upload one"} className="py-8" />
      ) : (
        <ul className="m-0 p-0 list-none grid grid-cols-3 sm:grid-cols-5 gap-3 max-h-[55vh] overflow-y-auto pr-1">
          {shown.map((f) => {
            const on = picked.includes(f.url);
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => toggle(f.url)}
                  aria-pressed={on}
                  title={f.name}
                  className={`relative w-full aspect-square rounded-lg overflow-hidden border-2 bg-app-bg p-0 cursor-pointer ${on ? "border-accent" : "border-transparent hover:border-app-border"}`}
                >
                  <img src={f.url} alt={f.name} className="w-full h-full object-cover" loading="lazy" />
                  {on && (
                    <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center">
                      <Check size={14} aria-hidden="true" />
                    </span>
                  )}
                </button>
                <p className="m-0 mt-1 text-[11px] text-ink-muted truncate">{f.name}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
