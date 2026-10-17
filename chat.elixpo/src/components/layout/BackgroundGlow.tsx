import React from 'react';

export function BackgroundGlow() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-[#050510]">
      {/* Deep background gradients (Purple & Blue Elixpo theme) */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_center,#4C1D95_0%,transparent_70%),radial-gradient(ellipse_at_top_left,#1E3A8A_0%,transparent_50%),radial-gradient(ellipse_at_top_right,#1E40AF_0%,transparent_50%)] opacity-50" />
      
      {/* Vertical ridges texture mimicking the Rig AI design */}
      <div 
        className="absolute inset-0 opacity-[0.15] mix-blend-screen" 
        style={{ 
          backgroundImage: 'repeating-linear-gradient(to right, transparent, transparent 4px, rgba(255,255,255,0.4) 4px, rgba(255,255,255,0.4) 8px)',
          maskImage: 'linear-gradient(to bottom, black 0%, transparent 60%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 60%)'
        }} 
      />
      
      {/* Dynamic Animated Streaks */}
      <div className="absolute inset-0 opacity-40" style={{ maskImage: 'linear-gradient(to bottom, black 0%, transparent 80%)', WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 80%)' }}>
        <div className="absolute top-0 left-[15%] w-[2px] h-[100%] bg-gradient-to-b from-transparent via-[#8B5CF6]/50 to-transparent animate-[aurora_8s_ease-in-out_infinite]" />
        <div className="absolute top-0 left-[25%] w-[4px] h-[100%] bg-gradient-to-b from-transparent via-[#3B82F6]/40 to-transparent animate-[aurora_10s_ease-in-out_infinite_1s]" />
        <div className="absolute top-0 left-[35%] w-[1.5px] h-[100%] bg-gradient-to-b from-transparent via-[#6D28D9]/40 to-transparent animate-[aurora_12s_ease-in-out_infinite_2s]" />
        <div className="absolute top-0 left-[50%] w-[3px] h-[100%] bg-gradient-to-b from-transparent via-[#60A5FA]/40 to-transparent animate-[aurora_9s_ease-in-out_infinite_0.5s]" />
        <div className="absolute top-0 left-[65%] w-[2px] h-[100%] bg-gradient-to-b from-transparent via-[#8B5CF6]/40 to-transparent animate-[aurora_11s_ease-in-out_infinite_3s]" />
        <div className="absolute top-0 left-[75%] w-[4px] h-[100%] bg-gradient-to-b from-transparent via-[#2563EB]/50 to-transparent animate-[aurora_7s_ease-in-out_infinite_1.5s]" />
      </div>

      {/* Top intense glow dome */}
      <div className="absolute top-[-30%] left-1/2 -translate-x-1/2 w-[140%] h-[700px] bg-gradient-to-b from-[#4C1D95]/30 via-[#1E3A8A]/10 to-transparent blur-[120px]" />
    </div>
  );
}
