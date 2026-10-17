import React from 'react';

export function Sidebar() {
  return (
    <div className="flex flex-col h-full w-full text-[#f0ede6] bg-[#0a0a0a] border-r border-[rgba(240,237,230,0.08)]">
      {/* Top Section */}
      <div className="p-4 border-b border-[rgba(240,237,230,0.08)]">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xl font-bold uppercase tracking-wider text-[#0a0a0a] bg-[#f0ede6] px-2 py-0.5">
             Elixpo
          </div>
        </div>
        <button className="w-full py-3 px-4 bg-[#6366f1] text-[#f0ede6] hover:bg-[#5b5bd6] transition-colors font-mono text-[11px] font-bold tracking-[0.05em] uppercase flex items-center justify-center gap-2" style={{ clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))' }}>
          <span>+</span> NEW CHAT
        </button>
      </div>

      {/* Pinned Routes */}
      <div className="p-2 border-b border-[rgba(240,237,230,0.08)]">
        <div className="px-3 py-2 text-[10px] font-bold text-[rgba(240,237,230,0.3)] tracking-[0.2em] uppercase font-mono">Pinned</div>
        <div className="flex flex-col gap-0.5 mt-1">
          <NavItem icon={<SearchIcon />} label="Search" active />
          <NavItem icon={<NewsIcon />} label="News" />
          <NavItem icon={<PodcastIcon />} label="Podcast" />
          <NavItem icon={<WeatherIcon />} label="Weather" />
        </div>
      </div>

      {/* Recent Chats */}
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-[rgba(240,237,230,0.1)] scrollbar-track-transparent">
        <div className="px-3 py-2 text-[10px] font-bold text-[rgba(240,237,230,0.3)] tracking-[0.2em] uppercase font-mono mt-2">Recent Chats</div>
        <div className="flex flex-col gap-0.5 mt-1">
          <ChatListItem title="React 19 features" />
          <ChatListItem title="Python microservices architecture" />
          <ChatListItem title="Weather today in SF" />
        </div>
      </div>

      {/* User / Settings */}
      <div className="p-4 border-t border-[rgba(240,237,230,0.08)] flex items-center justify-between hover:bg-[rgba(240,237,230,0.04)] cursor-pointer transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#6366f1] flex items-center justify-center text-xs font-bold text-[#f0ede6]" style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}>
            U
          </div>
          <span className="text-[13px] font-medium text-[rgba(240,237,230,0.8)]">User Name</span>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[rgba(240,237,230,0.4)] hover:text-[#f0ede6] transition-colors">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </div>
    </div>
  );
}

/* ── SVG Icons ── */
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function NewsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function PodcastIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function WeatherIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />
    </svg>
  );
}

function NavItem({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button className={`w-full flex items-center gap-3 px-3 py-2.5 text-[11px] font-mono font-bold tracking-[0.05em] uppercase transition-all duration-200 relative
      ${active 
        ? 'text-[#f0ede6]' 
        : 'text-[rgba(240,237,230,0.4)] hover:text-[#f0ede6] hover:bg-[rgba(240,237,230,0.04)]'
      }`}
    >
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-[#6366f1]" />
      )}
      <span className={active ? 'text-[#6366f1]' : 'opacity-70'}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function ChatListItem({ title, active }: { title: string; active?: boolean }) {
  return (
    <button className={`w-full text-left truncate px-3 py-2 text-[13px] transition-colors relative
      ${active 
        ? 'text-[#f0ede6] bg-[rgba(240,237,230,0.04)]' 
        : 'text-[rgba(240,237,230,0.5)] hover:text-[#f0ede6] hover:bg-[rgba(240,237,230,0.02)]'
      }`}
    >
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-full bg-[rgba(240,237,230,0.2)]" />
      )}
      {title}
    </button>
  );
}
