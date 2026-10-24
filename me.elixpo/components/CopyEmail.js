"use client";

import { useState } from "react";

export default function CopyEmail({ email }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(email); }
    catch {
      const field = document.createElement("textarea");
      field.value = email;
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return <button type="button" className="copy-email" onClick={handleCopy}>
    <span>{email}</span><b>{copied ? "Copied" : "Copy"}</b>
  </button>;
}
