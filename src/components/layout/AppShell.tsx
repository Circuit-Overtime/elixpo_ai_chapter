import React from 'react';
import { Sidebar } from './Sidebar';
import { HeaderBar } from './HeaderBar';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-[#0a0a0a] text-[#f0ede6] overflow-hidden selection:bg-[#6366f1]/40 relative">
      {/* ════ Overlays (scanlines, noise) — Rig AI style ════ */}
      <div className="fixed inset-0 z-[100] pointer-events-none" style={{
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)'
      }} />
      <div className="fixed inset-0 z-[99] pointer-events-none opacity-[0.04]" style={{
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
        backgroundSize: '128px 128px'
      }} />

      <div className="flex w-full h-full relative z-10">
        {/* Sidebar - fixed on desktop, hidden/drawer on mobile */}
        <div className="hidden md:flex w-[280px] shrink-0 border-r border-white/[0.05] bg-white/[0.01] backdrop-blur-xl flex-col shadow-[10px_0_30px_rgba(0,0,0,0.5)] z-20 relative">
          <Sidebar />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-transparent relative z-10">
          <HeaderBar />
          <main className="flex-1 overflow-y-auto relative">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
