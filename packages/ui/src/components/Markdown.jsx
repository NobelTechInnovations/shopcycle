"use client";

import Link from "next/link";

/**
 * Just enough Markdown for help answers and articles: paragraphs, "- "
 * and "1." lists, **bold**, `code` and [links](...). Built as React
 * elements — never as HTML — so nothing in an answer can inject markup.
 * Dashboard links (/admin/…) navigate inside the app; others open in a
 * new tab, and only http(s) ones are links at all.
 */

function inline(text, keyBase) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[1]) out.push(<strong key={key} className="font-semibold text-ink">{m[1]}</strong>);
    else if (m[2]) out.push(<code key={key} className="px-1 py-0.5 rounded bg-app-bg border border-app-border text-[0.92em]">{m[2]}</code>);
    else if (m[3]) {
      const href = m[4];
      if (href.startsWith("/admin")) {
        out.push(<Link key={key} href={href} className="text-accent font-medium underline decoration-accent/30 underline-offset-2 hover:decoration-accent">{m[3]}</Link>);
      } else if (/^https?:\/\//i.test(href)) {
        out.push(<a key={key} href={href} target="_blank" rel="noopener noreferrer" className="text-accent font-medium underline decoration-accent/30 underline-offset-2">{m[3]}</a>);
      } else out.push(m[3]);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className = "" }) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (bullet || numbered) {
      flushPara();
      const type = bullet ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(bullet ? bullet[1] : numbered[2]);
    } else if (heading) {
      flushPara();
      flushList();
      blocks.push({ type: "h", text: heading[1] });
    } else if (list && /^\s{2,}/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();

  return (
    <div className={`text-[14px] leading-relaxed text-ink [&>*+*]:mt-2.5 ${className}`}>
      {blocks.map((b, i) => {
        if (b.type === "p") return <p key={i} className="m-0">{inline(b.text, i)}</p>;
        if (b.type === "h") return <p key={i} className="m-0 font-semibold">{inline(b.text, i)}</p>;
        const Tag = b.type;
        return (
          <Tag key={i} className={`m-0 pl-5 ${b.type === "ul" ? "list-disc" : "list-decimal"} [&>li+li]:mt-1 marker:text-ink-subtle`}>
            {b.items.map((item, j) => (
              <li key={j} className="pl-0.5">{inline(item, `${i}-${j}`)}</li>
            ))}
          </Tag>
        );
      })}
    </div>
  );
}
