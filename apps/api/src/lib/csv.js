/**
 * CSV in and out (RFC 4180): quoted fields, doubled quotes, commas and
 * line breaks inside quotes, CRLF or LF, and an Excel byte-order mark.
 */

function parseCsv(text) {
  const src = String(text).replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Rows → objects keyed by the header row (headers trimmed, case kept). */
function parseCsvObjects(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return { headers: [], records: [] };
  const headers = header.map((h) => h.trim());
  return {
    headers,
    records: rows.map((r, index) => ({
      line: index + 2, // 1-based, after the header — what a spreadsheet shows
      values: Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])),
    })),
  };
}

/**
 * A cell starting with = + - @ (or a tab/CR) runs as a formula when the
 * file is opened in Excel or Sheets — a shopper who types
 * "=HYPERLINK(...)" as their name shouldn't get to run it on the
 * merchant's computer. Such cells are prefixed with an apostrophe, the
 * standard neutraliser; plain negative numbers are left alone.
 */
function safeCell(value) {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(safeCell).join(",")];
  for (const row of rows) lines.push(headers.map((h) => safeCell(row[h])).join(","));
  // BOM so Excel opens UTF-8 (₹, Hindi names) correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

module.exports = { parseCsv, parseCsvObjects, toCsv, safeCell };
