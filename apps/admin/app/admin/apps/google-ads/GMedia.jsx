"use client";

import { useCallback, useEffect, useState } from "react";
import { Upload, Button, Modal, App, Empty, Tag, Spin, Segmented } from "antd";
import { UploadCloud, Check } from "lucide-react";
import { API_URL, apiFetch } from "@/lib/api";

export const SLOT = {
  landscape: { label: "Landscape 1.91:1", hint: "e.g. 1200×628" },
  square: { label: "Square 1:1", hint: "e.g. 1200×1200" },
  portrait: { label: "Portrait 4:5", hint: "e.g. 960×1200" },
  logo: { label: "Logo 1:1", hint: "e.g. 1200×1200, at least 128×128" },
};

export function useGLibrary() {
  const [items, setItems] = useState(null);
  const load = useCallback(() => apiFetch("/api/google-ads/media").then((d) => setItems(d.media)).catch(() => setItems([])), []);
  useEffect(() => {
    load();
  }, [load]);
  return { items, load };
}

function UploadImage({ onUploaded }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  return (
    <Upload
      showUploadList={false}
      accept="image/jpeg,image/png"
      beforeUpload={(f) => (f.size > 5 * 1024 * 1024 ? (message.error("Google allows images up to 5 MB."), Upload.LIST_IGNORE) : true)}
      customRequest={async ({ file }) => {
        setBusy(true);
        const fd = new FormData();
        fd.append("file", file);
        try {
          const res = await fetch(`${API_URL}/api/google-ads/media`, { method: "POST", credentials: "include", body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Upload failed");
          message.success("Uploaded to your Google Ads account");
          onUploaded(data.media);
        } catch (err) {
          message.error(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Button icon={<UploadCloud size={14} aria-hidden="true" />} loading={busy}>
        Upload image
      </Button>
    </Upload>
  );
}

function Tile({ m, selected, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`relative rounded-lg border overflow-hidden bg-app-bg text-left ${selected ? "border-accent ring-2 ring-accent" : "border-app-border"}`} disabled={!onClick}>
      <span className="block aspect-square">
        {m.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.previewUrl} alt="" className="w-full h-full object-contain" />
        ) : null}
      </span>
      {selected && (
        <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent text-white grid place-items-center">
          <Check size={12} aria-hidden="true" />
        </span>
      )}
      <span className="block px-1.5 py-1 text-[11px] truncate">{m.width && m.height ? `${m.width}×${m.height}` : m.name}</span>
      <span className="flex flex-wrap gap-0.5 px-1 pb-1">
        {(m.fits || []).map((f) => (
          <Tag key={f} className="!text-[10px] !leading-4 !m-0">{f}</Tag>
        ))}
      </span>
    </button>
  );
}

/** Choose images for one slot (landscape / square / portrait / logo). */
export function GImagePicker({ open, onClose, onPick, slot, max = 20, selected = [] }) {
  const { items, load } = useGLibrary();
  const [picked, setPicked] = useState([]);
  useEffect(() => {
    if (open) {
      setPicked(selected);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const list = (items || []).filter((m) => (m.fits || []).includes(slot));
  const toggle = (rn) => setPicked((p) => (p.includes(rn) ? p.filter((x) => x !== rn) : p.length >= max ? p : [...p, rn]));
  return (
    <Modal open={open} onCancel={onClose} title={`Choose ${SLOT[slot]?.label || ""} images`} width={760} okText="Use them" onOk={() => onPick(picked, (items || []).filter((m) => picked.includes(m.hash)))}>
      <div className="flex justify-between items-center mb-3">
        <p className="text-xs text-ink-muted m-0">{SLOT[slot]?.hint}. Only images of this shape are shown.</p>
        <UploadImage onUploaded={() => load()} />
      </div>
      {items === null ? (
        <div className="py-10 text-center">
          <Spin />
        </div>
      ) : list.length ? (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-[55vh] overflow-y-auto">
          {list.map((m) => (
            <Tile key={m.id} m={m} selected={picked.includes(m.hash)} onClick={() => toggle(m.hash)} />
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No ${SLOT[slot]?.label || ""} images yet — upload one (${SLOT[slot]?.hint}).`} />
      )}
    </Modal>
  );
}

export default function GMedia() {
  const { items, load } = useGLibrary();
  const [slot, setSlot] = useState("all");
  const list = (items || []).filter((m) => slot === "all" || (m.fits || []).includes(slot));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap justify-between gap-2">
        <Segmented value={slot} onChange={setSlot} options={[{ value: "all", label: "All" }, ...Object.entries(SLOT).map(([value, s]) => ({ value, label: s.label }))]} />
        <UploadImage onUploaded={load} />
      </div>
      <p className="text-xs text-ink-muted m-0">Images are uploaded to your Google Ads account. Google needs landscape (1.91:1), square (1:1) and a square logo for Performance Max and Display; portrait (4:5) is optional. JPG or PNG, up to 5 MB.</p>
      {items === null ? (
        <div className="py-10 text-center">
          <Spin />
        </div>
      ) : list.length ? (
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2">
          {list.map((m) => (
            <Tile key={m.id} m={m} />
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Your Google ad images appear here." />
      )}
    </div>
  );
}
