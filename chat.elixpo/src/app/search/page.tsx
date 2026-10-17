import React from 'react';
import { SearchInput } from '@/components/search/SearchInput';
import { ThreeTierCard } from '@/components/search/ThreeTierCard';
import { SearchResultCard } from '@/components/search/SearchResultCard';
import { LixSearchBadge } from '@/components/search/LixSearchBadge';

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-base text-primary flex flex-col items-center pt-24 px-4 pb-10">
      
      {/* Page Header */}
      <div className="flex flex-col items-center mb-10 text-center">
        <div className="text-4xl font-display mb-3 flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent-500 text-white font-bold text-2xl shadow-[0_0_15px_rgba(59,130,246,0.3)]">Ⓔ</span> 
          ElixSearch
        </div>
        
        <h1 className="text-xl font-medium mb-5">
          Web search powered by <span className="font-semibold text-primary">lixsearch</span>
        </h1>
        
        <div className="flex items-center gap-3">
          <LixSearchBadge />
          <div className="px-3 py-1 rounded-full border border-default bg-surface text-secondary text-xs font-medium tracking-wide">
            ● Three-tier
          </div>
        </div>
        
        <p className="mt-4 text-amber-400 text-sm font-medium tracking-wide">
          Runs on CPU · Zero GPU
        </p>
      </div>

      {/* Input Box */}
      <div className="w-full max-w-3xl flex flex-col items-center">
        <SearchInput />
        <ThreeTierCard />
      </div>

      {/* Example Search Result Card (Mock for UI view) */}
      <div className="mt-16 w-full max-w-3xl border-t border-subtle pt-10">
        <SearchResultCard 
          answer="The `lixsearch` architecture uses commodity CPU hardware to generate responses, eliminating the need for expensive and hard-to-acquire GPUs. By separating the Gateway (Cloudflare), Search Engine, and Inference model across a three-tier architecture, it provides a highly scalable and cost-effective solution."
          citations={[
            { url: "https://elixpo.com/docs/architecture", title: "Elixpo 3-Tier Architecture" }
          ]}
          latency={842}
        />
      </div>

      {/* Footer footprint */}
      <div className="mt-auto pt-20 text-muted text-xs">
        lixsearch · 3-tier CPU inference · search.elixpo.com
      </div>
    </div>
  );
}
