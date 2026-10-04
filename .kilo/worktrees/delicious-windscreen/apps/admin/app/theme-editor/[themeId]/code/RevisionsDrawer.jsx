"use client";

import { useEffect, useState } from "react";
import { Drawer, Button, Empty, Spin } from "antd";
import { apiFetch } from "@/lib/api";

function formatWhen(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleString();
}

export function RevisionsDrawer({ themeId, file, onClose, onRestore }) {
  const [revisions, setRevisions] = useState(null);
  const [restoringId, setRestoringId] = useState(null);

  useEffect(() => {
    if (!file) return;
    setRevisions(null);
    apiFetch(`/api/themes/${themeId}/files/${file.id}/revisions`).then((d) => setRevisions(d.revisions));
  }, [themeId, file]);

  async function handleRestore(revisionId) {
    setRestoringId(revisionId);
    try {
      const { file: restored } = await apiFetch(
        `/api/themes/${themeId}/files/${file.id}/revisions/${revisionId}/restore`,
        { method: "POST" }
      );
      onRestore(restored);
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <Drawer title={file ? `Version history — ${file.path.split("/").pop()}` : "Version history"} open={Boolean(file)} onClose={onClose} width={380}>
      {!revisions && <Spin />}
      {revisions?.length === 0 && (
        <Empty description="No earlier versions yet — they're captured automatically as you save." />
      )}
      <div className="flex flex-col gap-2">
        {revisions?.map((rev) => (
          <div key={rev.id} className="border border-app-border rounded-md p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium m-0">{formatWhen(rev.createdAt)}</p>
              <p className="text-xs text-ink-muted m-0">{rev.content.length.toLocaleString()} characters</p>
            </div>
            <Button size="small" loading={restoringId === rev.id} onClick={() => handleRestore(rev.id)}>
              Restore
            </Button>
          </div>
        ))}
      </div>
    </Drawer>
  );
}
