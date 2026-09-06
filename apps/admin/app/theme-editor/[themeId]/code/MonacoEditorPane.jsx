"use client";

import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="p-4 text-sm text-ink-muted">Loading editor…</div>,
});

const LANG_BY_EXT = { liquid: "liquid", json: "json", css: "css", js: "javascript" };

let liquidRegistered = false;

/** Monaco has no built-in Liquid mode — this registers a lightweight
 * Monarch tokenizer (tags, output blocks, strings, keywords) so `.liquid`
 * files at least get real syntax highlighting instead of being treated as
 * plain text. It's deliberately not a full grammar (no expression-level
 * parsing) — JSON gets Monaco's real built-in language service instead,
 * including live error squiggles, for free. */
function registerLiquidLanguage(monaco) {
  if (liquidRegistered) return;
  liquidRegistered = true;

  monaco.languages.register({ id: "liquid" });
  monaco.languages.setMonarchTokensProvider("liquid", {
    tokenizer: {
      root: [
        [/\{%-?\s*comment\s*-?%\}/, { token: "comment", next: "@liquidComment" }],
        [/\{%-?/, { token: "delimiter.liquid", next: "@tag" }],
        [/\{\{-?/, { token: "delimiter.liquid", next: "@output" }],
        [/[^{]+/, ""],
        [/./, ""],
      ],
      liquidComment: [
        [/\{%-?\s*endcomment\s*-?%\}/, { token: "comment", next: "@pop" }],
        [/./, "comment"],
      ],
      tag: [
        [/-?%\}/, { token: "delimiter.liquid", next: "@pop" }],
        [
          /\b(if|elsif|else|endif|unless|endunless|for|endfor|break|continue|case|when|endcase|assign|capture|endcapture|render|include|section|schema|endschema|comment|endcomment|layout|liquid)\b/,
          "keyword",
        ],
        [/'[^']*'|"[^"]*"/, "string"],
        [/[a-zA-Z_][\w.]*/, "variable"],
        [/./, ""],
      ],
      output: [
        [/-?\}\}/, { token: "delimiter.liquid", next: "@pop" }],
        [/\|/, "operator"],
        [/'[^']*'|"[^"]*"/, "string"],
        [/[a-zA-Z_][\w.]*/, "variable"],
        [/./, ""],
      ],
    },
  });
}

export function MonacoEditorPane({ path, value, onChange, onMount }) {
  const ext = path.split(".").pop();
  const language = LANG_BY_EXT[ext] || "plaintext";

  return (
    <Editor
      key={path} // remount per file — simplest way to avoid Monaco's undo/model state bleeding across files
      height="100%"
      language={language}
      value={value}
      theme="vs"
      beforeMount={registerLiquidLanguage}
      onMount={onMount}
      onChange={(v) => onChange(v ?? "")}
      options={{
        fontSize: 13,
        fontFamily: "'Fira Code', monospace",
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        tabSize: 2,
        wordWrap: "on",
      }}
    />
  );
}
