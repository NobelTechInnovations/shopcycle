"use client";

import { useState } from "react";
import Link from "next/link";

const DEVICES = [
  ["desktop", "Desktop", "100%"],
  ["tablet", "Tablet", "820px"],
  ["phone", "Phone", "390px"],
];

/** The theme on the demo store, page by page — rendered by Oyklane, so the
 * theme's files never leave the server. */
export function PreviewFrame({ name, slug, base, themeId, pages, getHref, getLabel }) {
  const [page, setPage] = useState(pages[0]?.path || "/");
  const [device, setDevice] = useState("desktop");
  const src = `${base}${page}${page.includes("?") ? "&" : "?"}themeId=${encodeURIComponent(themeId)}`;
  const width = DEVICES.find((d) => d[0] === device)[2];
  return (
    <div className="pv">
      <div className="pv__bar">
        <Link className="btn btn--sm btn--ghost" href={`/themes/${slug}`} aria-label="Back to the theme">
          ←
        </Link>
        <div className="pv__name">
          {name} <small className="subtle">preview</small>
        </div>
        <div className="pv__pages" role="group" aria-label="Page">
          {pages.map((p) => (
            <button key={p.key} type="button" aria-pressed={page === p.path} onClick={() => setPage(p.path)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="seg pv__devices" role="group" aria-label="Screen size">
          {DEVICES.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={device === key} onClick={() => setDevice(key)}>
              {label}
            </button>
          ))}
        </div>
        <a className="btn btn--sm btn--accent" href={getHref}>
          {getLabel}
        </a>
      </div>
      <div className="pv__stage">
        <iframe key={src} className="pv__frame" style={{ width }} src={src} title={`${name} preview`} />
      </div>
    </div>
  );
}
