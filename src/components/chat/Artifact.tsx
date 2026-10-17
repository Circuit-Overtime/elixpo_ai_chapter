"use client";

import { useState } from "react";

export default function Artifact({ content, title }: { content: string; title?: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-3 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-violet-100 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-neutral-700">{title || "Artifact"}</span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-neutral-500 hover:text-neutral-700 px-2 py-1 rounded hover:bg-neutral-100 transition-colors cursor-pointer"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      <div className={`transition-all duration-300 overflow-hidden ${expanded ? "max-h-[80vh]" : "max-h-48"}`}>
        <div className="p-4 text-sm text-neutral-700 whitespace-pre-wrap font-mono leading-relaxed overflow-auto">
          {content}
        </div>
      </div>
    </div>
  );
}
