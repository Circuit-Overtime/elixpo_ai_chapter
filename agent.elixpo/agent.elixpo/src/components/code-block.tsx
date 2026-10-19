"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CodeBlock({
  code,
  language = "text",
  title,
}: {
  code: string;
  language?: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  const lines = code.replace(/^\n|\n$/g, "").split("\n");

  async function copyCode() {
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="docs-code-block">
      <header className="docs-code-head">
        <span className="docs-window-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="docs-code-label">{title || language}</span>
        <button type="button" onClick={copyCode} aria-label="Copy code">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </header>
      <pre className="docs-code"><code>{lines.map((line, index) => (
        <span className="docs-code-line" key={`${index}-${line}`}>
          <i aria-hidden="true">{index + 1}</i><b>{line || " "}</b>
        </span>
      ))}</code></pre>
    </div>
  );
}
