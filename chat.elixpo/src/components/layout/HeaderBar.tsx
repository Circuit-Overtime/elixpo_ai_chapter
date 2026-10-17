import React from 'react';
import PollinationsBadge from '../chat/PollinationsBadge';

export function HeaderBar() {
  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-[rgba(240,237,230,0.08)] bg-[#0a0a0a] sticky top-0 z-10 text-[#f0ede6]">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <button className="md:hidden p-2 -ml-2 text-[rgba(240,237,230,0.4)] hover:text-[#f0ede6] transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="font-mono text-[11px] font-bold tracking-[0.1em] uppercase text-[rgba(240,237,230,0.4)] flex items-center gap-2">
          <span>Elixpo</span>
          <span className="text-[rgba(240,237,230,0.2)]">/</span>
          <span className="text-[#f0ede6]">Chat</span>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex">
          <PollinationsBadge />
        </div>
      </div>
    </header>
  );
}
