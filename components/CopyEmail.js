"use client";

import { useState } from "react";

export default function CopyEmail({ email }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = email;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="group flex w-full max-w-[600px] items-center gap-2 rounded-[12px] border-2 border-[#222] bg-[#e6ddc6] px-3 py-3 text-left transition-colors duration-200 hover:bg-[#1B1B19] hover:text-[#E2D9C8] sm:gap-4 sm:rounded-[15px] sm:px-6 sm:py-4"
    >
      <ion-icon name="mail-outline" className="shrink-0" style={{ fontSize: "1.6em" }}></ion-icon>
      <span className="emailText min-w-0 flex-1 break-all text-[1rem] font-bold tracking-wide sm:text-[1.25rem]">
        {email}
      </span>
      <span className="shrink-0 text-[0.68rem] font-semibold opacity-70 transition-opacity group-hover:opacity-100 sm:text-[0.85rem]">
        {copied ? "Copied!" : "Click to copy"}
      </span>
    </button>
  );
}
