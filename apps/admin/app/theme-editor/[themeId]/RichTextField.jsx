"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, Popover, Tooltip } from "antd";
import { Bold, Italic, Underline, Highlighter, Palette, Link2, RemoveFormatting } from "lucide-react";

/**
 * The theme editor's text editor for `textarea` / `richtext` settings:
 * select words and make them bold, italic, underlined, highlighted, the
 * theme's accent colour, or a link. Inline only — themes print the text
 * inside their own paragraphs and headings — so a new line is a line break.
 * Saves HTML (committed when the field loses focus, like the other text
 * fields); the storefront cleans it again before printing it.
 */

const INLINE = { STRONG: "strong", B: "strong", EM: "em", I: "em", U: "u", S: "s", MARK: "mark", SPAN: "span", A: "a", SMALL: "small", SUP: "sup", SUB: "sub" };
const BLOCKS = new Set(["P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "TR"]);
const SKIP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT", "SVG", "MATH", "TEXTAREA", "SELECT"]);
const CLASSES = ["oy-hl", "oy-accent"];

const escText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => escText(s).replace(/"/g, "&quot;");
const safeHref = (v) => {
  const url = String(v || "").trim();
  return /^(https?:|mailto:|tel:)/i.test(url) || /^[/#?]/.test(url) ? url : null;
};

function walk(node, out) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      out.push(escText(child.nodeValue));
      continue;
    }
    if (child.nodeType !== 1 || SKIP.has(child.tagName)) continue;
    const tag = child.tagName;
    if (tag === "BR") {
      out.push("<br>");
      continue;
    }
    if (BLOCKS.has(tag)) {
      if (out.length && out[out.length - 1] !== "<br>") out.push("<br>");
      walk(child, out);
      continue;
    }
    let name = INLINE[tag];
    let attrs = "";
    if (name === "a") {
      const href = safeHref(child.getAttribute("href"));
      if (href) attrs += ` href="${escAttr(href)}"`;
      if (child.getAttribute("target") === "_blank") attrs += ' target="_blank" rel="noopener"';
    } else if (name === "mark" || name === "span") {
      const kept = (child.getAttribute("class") || "").split(/\s+/).filter((c) => CLASSES.includes(c));
      if (kept.length) attrs = ` class="${kept.join(" ")}"`;
      else if (name === "span") {
        // execCommand sometimes formats with inline styles instead of tags.
        const st = child.style;
        name = /bold|[6-9]00/.test(st.fontWeight) ? "strong" : st.fontStyle === "italic" ? "em" : /underline/.test(st.textDecorationLine || st.textDecoration) ? "u" : null;
      }
    }
    if (!name) {
      walk(child, out);
      continue;
    }
    out.push(`<${name}${attrs}>`);
    walk(child, out);
    out.push(`</${name}>`);
  }
}

/** Any HTML (saved, pasted or typed) → the inline HTML this field keeps.
 * Parsed in an inert document, so nothing in it runs or loads. */
export function cleanRichText(html) {
  if (!html) return "";
  const looksLikeHtml = /<[a-z/!]/i.test(html);
  const source = looksLikeHtml ? html : escText(html).replace(/\r?\n/g, "<br>");
  const doc = new DOMParser().parseFromString(`<body>${source}</body>`, "text/html");
  const out = [];
  walk(doc.body, out);
  return out
    .join("")
    .replace(/(<br>)+$/, "")
    .replace(/^(<br>)+/, "");
}

function unwrap(el) {
  const parent = el.parentNode;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

export function RichTextField({ value, onChange, rows = 3, placeholder }) {
  const ref = useRef(null);
  const committed = useRef(null);
  const savedRange = useRef(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");

  // Shown value: on mount, and whenever it changes from outside (undo,
  // another section picked) — never while it's the editor's own edit.
  useEffect(() => {
    const el = ref.current;
    if (!el || value === committed.current) return;
    el.innerHTML = cleanRichText(typeof value === "string" ? value : "");
    committed.current = value;
  }, [value]);

  function commit() {
    const el = ref.current;
    if (!el) return;
    const html = cleanRichText(el.innerHTML);
    if (html === (committed.current || "")) return;
    committed.current = html;
    onChange(html);
  }

  function selectionInEditor() {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const range = sel.getRangeAt(0);
    return ref.current?.contains(range.commonAncestorContainer) ? range : null;
  }

  function exec(command, arg) {
    ref.current?.focus();
    document.execCommand("styleWithCSS", false, false);
    document.execCommand(command, false, arg);
  }

  /** Highlight / accent colour: wrap the selected words, or unwrap them. */
  function toggle(tag, cls) {
    const range = selectionInEditor();
    if (!range || range.collapsed) return;
    const at = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const existing = at?.closest(`${tag}.${cls}`);
    if (existing && ref.current.contains(existing)) {
      unwrap(existing);
      return;
    }
    const el = document.createElement(tag);
    el.className = cls;
    el.appendChild(range.extractContents());
    el.querySelectorAll(`${tag}.${cls}`).forEach(unwrap);
    range.insertNode(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    const r = document.createRange();
    r.selectNodeContents(el);
    sel.addRange(r);
  }

  function clearFormatting() {
    const range = selectionInEditor();
    if (!range || range.collapsed) return;
    exec("removeFormat");
    exec("unlink");
    ref.current.querySelectorAll("mark, span").forEach((el) => {
      if (range.intersectsNode(el)) unwrap(el);
    });
  }

  function openLink(open) {
    if (open) {
      const range = selectionInEditor();
      if (!range || range.collapsed) return;
      savedRange.current = range.cloneRange();
      const a = (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest("a");
      setHref(a?.getAttribute("href") || "");
    }
    setLinkOpen(open);
  }

  function applyLink() {
    const range = savedRange.current;
    setLinkOpen(false);
    if (!range) return;
    ref.current.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const url = href.trim();
    if (!url) exec("unlink");
    else exec("createLink", /^(https?:|mailto:|tel:|\/|#)/i.test(url) ? url : `https://${url}`);
    commit();
  }

  const tool = (label, icon, onClick) => (
    <Tooltip title={label} mouseEnterDelay={0.4}>
      <button
        type="button"
        aria-label={label}
        className="w-7 h-7 inline-flex items-center justify-center rounded-md border-0 bg-transparent text-ink-muted hover:bg-app-bg hover:text-ink cursor-pointer"
        // Keep the words selected.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
      >
        {icon}
      </button>
    </Tooltip>
  );

  return (
    <div className="oy-rte rounded-md border border-app-border bg-white focus-within:border-[#7C5CFF] focus-within:shadow-[0_0_0_2px_rgba(124,92,255,0.18)]">
      <div className="flex items-center gap-0.5 px-1 py-0.5 border-b border-app-border" role="toolbar" aria-label="Text formatting">
        {tool("Bold", <Bold size={14} aria-hidden="true" />, () => exec("bold"))}
        {tool("Italic", <Italic size={14} aria-hidden="true" />, () => exec("italic"))}
        {tool("Underline", <Underline size={14} aria-hidden="true" />, () => exec("underline"))}
        {tool("Highlight", <Highlighter size={14} aria-hidden="true" />, () => toggle("mark", "oy-hl"))}
        {tool("Accent colour", <Palette size={14} aria-hidden="true" />, () => toggle("span", "oy-accent"))}
        <Popover
          trigger="click"
          open={linkOpen}
          onOpenChange={openLink}
          content={
            <div className="flex gap-1.5 w-64">
              <Input size="small" autoFocus placeholder="https:// or /collections/…" value={href} onChange={(e) => setHref(e.target.value)} onPressEnter={applyLink} />
              <Button size="small" type="primary" onClick={applyLink}>
                {href.trim() ? "Apply" : "Remove"}
              </Button>
            </div>
          }
        >
          <span>{tool("Link — select words first", <Link2 size={14} aria-hidden="true" />, () => {})}</span>
        </Popover>
        {tool("Clear formatting", <RemoveFormatting size={14} aria-hidden="true" />, clearFormatting)}
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || "Write here — select words to format them"}
        className="oy-rte__body px-2.5 py-1.5 text-[13px] leading-relaxed text-ink outline-none overflow-y-auto"
        style={{ minHeight: rows * 22 + 12, maxHeight: 320 }}
        onBlur={commit}
        onKeyDown={(e) => {
          // One field = one paragraph in the theme: Enter is a line break.
          if (e.key === "Enter" && document.queryCommandSupported?.("insertLineBreak")) {
            e.preventDefault();
            document.execCommand("insertLineBreak");
          }
        }}
        onPaste={(e) => {
          // Words only — not the fonts and colours of wherever they came from.
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
      />
    </div>
  );
}
