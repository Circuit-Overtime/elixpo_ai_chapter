import React from 'react';
import { Search, Globe, ImageIcon } from 'lucide-react';

function ModeToggle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted hover:text-primary hover:bg-elevated transition-colors">
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SearchButton() {
  return (
    <button
      className="
        flex items-center gap-2 px-4 py-2 ml-1
        rounded-xl font-semibold text-sm
        bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500
        text-white
        shadow-[0_0_20px_rgba(59,130,246,0.35)]
        hover:shadow-[0_0_28px_rgba(59,130,246,0.55)]
        hover:from-blue-500 hover:to-cyan-400
        active:scale-[0.97]
        transition-all duration-200
        disabled:opacity-40 disabled:cursor-not-allowed
      "
    >
      <Search size={15} />
      Search with lixsearch
    </button>
  );
}

export function SearchInput() {
  return (
    <div className="relative flex items-center w-full max-w-3xl
                    bg-surface border border-default rounded-2xl
                    shadow-md focus-within:border-accent-500
                    focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.12)]
                    transition-all duration-200">
    
      <Search className="absolute left-4 text-muted" size={18} />
    
      <input
        className="w-full bg-transparent pl-11 pr-[300px] py-4
                   text-primary text-base placeholder:text-muted
                   outline-none"
        placeholder="Ask anything — news, research, images..."
      />
    
      {/* Mode pills inside input */}
      <div className="absolute right-2 flex items-center gap-1">
        <ModeToggle icon={<Globe size={13} />} label="Web" />
        <ModeToggle icon={<ImageIcon size={13} />} label="Vision" />
        <SearchButton />
      </div>
    </div>
  );
}
