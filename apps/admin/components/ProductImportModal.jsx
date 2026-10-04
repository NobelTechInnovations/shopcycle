"use client";

import { useState } from "react";
import { Modal, Upload, Button, Alert, App } from "antd";
import { FileSpreadsheet, Download, CheckCircle2 } from "lucide-react";
import { apiFetch, apiDownload } from "@/lib/api";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Product CSV import in two steps: the file is checked first (nothing is
 * written) and the merchant sees what will be created, updated or
 * skipped — then imports. Rows are matched to existing products by Handle
 * and to variants by SKU.
 */
export function ProductImportModal({ open, onClose, onImported }) {
  const { message } = App.useApp();
  const [file, setFile] = useState(null); // { name, text }
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
  }

  async function check(text) {
    setBusy(true);
    try {
      setPreview(await apiFetch("/api/data/imports/products", { method: "POST", body: { csv: text, dryRun: true } }));
    } catch (err) {
      message.error(err.message);
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setBusy(true);
    try {
      const res = await apiFetch("/api/data/imports/products", { method: "POST", body: { csv: file.text } });
      setResult(res);
      onImported();
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const beforeUpload = (f) => {
    if (f.size > MAX_BYTES) {
      message.error("That file is over 2 MB. Split it into smaller files.");
      return Upload.LIST_IGNORE;
    }
    f.text().then((text) => {
      setFile({ name: f.name, text });
      setResult(null);
      check(text);
    });
    return false;
  };

  const errors = (result || preview)?.errors || [];

  return (
    <Modal
      open={open}
      onCancel={() => {
        reset();
        onClose();
      }}
      title="Import products"
      width={600}
      destroyOnHidden
      footer={
        result ? (
          <Button
            type="primary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Done
          </Button>
        ) : (
          <>
            <Button
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              loading={busy && Boolean(preview)}
              disabled={!preview || preview.created + preview.updated === 0}
              onClick={runImport}
            >
              {preview ? `Import ${preview.created + preview.updated} product${preview.created + preview.updated === 1 ? "" : "s"}` : "Import"}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex items-start gap-3 mt-3 rounded-lg bg-app-bg px-4 py-3">
          <CheckCircle2 size={18} className="text-status-success mt-0.5 shrink-0" aria-hidden="true" />
          <p className="m-0 text-sm text-ink">
            Imported: <strong>{result.created}</strong> new, <strong>{result.updated}</strong> updated
            {result.skipped ? `, ${result.skipped} skipped` : ""}. Stock changes are in each product's inventory history.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-muted mt-2">
            One row per variant. Rows with the same <strong className="text-ink">Handle</strong> become one product; an existing handle updates that product, and a
            matching <strong className="text-ink">SKU</strong> updates that variant's price and stock.
          </p>
          <Button
            type="link"
            className="!px-0"
            icon={<Download size={14} aria-hidden="true" />}
            onClick={() => apiDownload("/api/data/templates/products", "product-import-template.csv").catch((err) => message.error(err.message))}
          >
            Download the template
          </Button>
          <Upload.Dragger accept=".csv,text/csv" maxCount={1} showUploadList={false} beforeUpload={beforeUpload} className="!mt-3">
            <div className="py-3 flex flex-col items-center gap-1">
              <FileSpreadsheet size={22} className="text-ink-muted" aria-hidden="true" />
              <span className="text-sm text-ink">{file ? file.name : "Drop a CSV file here, or click to choose"}</span>
              <span className="text-xs text-ink-muted">Up to 2 MB · 5,000 rows</span>
            </div>
          </Upload.Dragger>
          {busy && !preview && <p className="text-sm text-ink-muted mt-3 mb-0">Checking the file…</p>}
          {preview && (
            <div className="mt-4 rounded-lg border border-app-border px-4 py-3 text-sm text-ink">
              Ready: <strong>{preview.created}</strong> new product{preview.created === 1 ? "" : "s"}, <strong>{preview.updated}</strong> to update
              {preview.skipped ? (
                <>
                  , <strong className="text-status-danger">{preview.skipped}</strong> with problems (skipped)
                </>
              ) : null}
              . Nothing has been changed yet.
            </div>
          )}
        </>
      )}
      {errors.length > 0 && (
        <Alert
          className="mt-3"
          type="warning"
          showIcon
          message={`${errors.length} row${errors.length === 1 ? "" : "s"} need fixing`}
          description={
            <ul className="m-0 pl-4 max-h-40 overflow-y-auto text-[13px]">
              {errors.slice(0, 50).map((e, i) => (
                <li key={i}>
                  Row {e.line}: {e.message}
                </li>
              ))}
            </ul>
          }
        />
      )}
    </Modal>
  );
}
