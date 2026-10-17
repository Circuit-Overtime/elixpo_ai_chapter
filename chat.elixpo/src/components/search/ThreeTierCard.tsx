import React from 'react';
import { Cpu, ChevronDown } from 'lucide-react';

export function ThreeTierCard() {
  return (
    <details className="mt-4 max-w-3xl w-full group">
      <summary className="flex items-center gap-2 text-muted text-xs cursor-pointer hover:text-secondary select-none list-none">
        <span className="flex items-center gap-1.5">
          <Cpu size={12} className="text-amber-400" />
          <span>How lixsearch works</span>
        </span>
        <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
      </summary>

      <div className="mt-3 p-4 bg-surface border border-subtle rounded-xl grid grid-cols-3 gap-4 text-xs">
        <div className="flex flex-col gap-1.5">
          <span className="text-accent-400 font-semibold uppercase tracking-wider text-[10px]">
            Tier 1 · Gateway
          </span>
          <span className="text-secondary">
            Cloudflare edge — auth, rate limiting, routing
          </span>
        </div>

        <div className="flex flex-col gap-1.5 border-x border-subtle px-4">
          <span className="text-blue-400 font-semibold uppercase tracking-wider text-[10px]">
            Tier 2 · Search
          </span>
          <span className="text-secondary">
            Web crawl, content extraction, source synthesis
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-amber-400 font-semibold uppercase tracking-wider text-[10px]">
            Tier 3 · Model · CPU
          </span>
          <span className="text-secondary">
            lixsearch inference on commodity CPU — no GPU required
          </span>
        </div>
      </div>
    </details>
  );
}
