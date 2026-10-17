import React from 'react';

export function LixSearchBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-cpu-border bg-cpu-muted text-cpu text-xs font-medium tracking-wide">
      <span className="w-1.5 h-1.5 rounded-full bg-cpu animate-pulse" />
      CPU-Powered · lixsearch
    </div>
  );
}
