import React from 'react';

export default function PollinationsBadge() {
  return (
    <div className="group relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--color-pollinations-border)] bg-[var(--color-pollinations-muted)] text-[var(--color-pollinations)] text-xs font-medium tracking-wide cursor-default">
      <span className="w-1.5 h-1.5 rounded-full bg-cpu animate-pulse shrink-0" />
      <span className="whitespace-nowrap text-violet-300">Pollinations AI · CPU-hosted</span>
      
      {/* Tooltip */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-[200px] px-2 py-1.5 bg-elevated border border-border-default rounded-md text-[10px] text-secondary opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 text-center shadow-lg">
        chat.elixpo uses Pollinations AI on a CPU-hosted 3-tier infra
      </div>
    </div>
  );
}
