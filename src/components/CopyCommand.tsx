"use client";

import { useState } from "react";

type CopyCommandProps = {
  command: string;
  label: string;
  variant?: "card" | "detail";
};

export function CopyCommand({ command, label, variant = "card" }: CopyCommandProps) {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={variant === "detail" ? "install-command copy-command copy-command-detail" : "command copy-command"}>
      <div className="command-heading">
        <span>{label}</span>
        <button type="button" onClick={copyCommand} aria-label={`Copy ${label} installation command`}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre><code>{command}</code></pre>
    </div>
  );
}
