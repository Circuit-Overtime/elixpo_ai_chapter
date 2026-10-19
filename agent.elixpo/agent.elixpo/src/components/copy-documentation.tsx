"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyDocumentation({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button className="docs-copy-llm" type="button" onClick={copy}>
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? "Copied for LLM" : "Copy docs for LLM"}
    </button>
  );
}
