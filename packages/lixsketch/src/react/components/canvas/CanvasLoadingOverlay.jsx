"use client"

import useUIStore from '../../store/useUIStore'

export default function CanvasLoadingOverlay() {
  const loading = useUIStore((s) => s.canvasLoading)
  const message = useUIStore((s) => s.canvasLoadingMessage)

  if (!loading) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm font-[lixFont] pointer-events-all">
      <div className="flex flex-col items-center gap-5">
        <style>{`
          @keyframes cl-glob {
            0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.7; }
            25% { transform: translate(10px, -6px) scale(1.12); opacity: 0.9; }
            50% { transform: translate(-5px, 8px) scale(0.9); opacity: 0.6; }
            75% { transform: translate(-8px, -4px) scale(1.08); opacity: 0.85; }
          }
          @keyframes cl-glob-2 {
            0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
            25% { transform: translate(-8px, 5px) scale(1.1); opacity: 0.85; }
            50% { transform: translate(6px, -8px) scale(0.95); opacity: 0.7; }
            75% { transform: translate(5px, 6px) scale(1.12); opacity: 0.9; }
          }
          @keyframes cl-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-3px); }
          }
        `}</style>

        <div className="relative w-20 h-20">
          <div className="absolute rounded-full" style={{
            width: 38, height: 38, top: 2, left: 4,
            background: 'radial-gradient(circle, rgba(59,130,246,0.5) 0%, transparent 70%)',
            filter: 'blur(10px)',
            animation: 'cl-glob 3.5s ease-in-out infinite',
            willChange: 'transform, opacity',
          }} />
          <div className="absolute rounded-full" style={{
            width: 34, height: 34, top: 14, right: 2,
            background: 'radial-gradient(circle, rgba(168,85,247,0.45) 0%, transparent 70%)',
            filter: 'blur(10px)',
            animation: 'cl-glob-2 4s ease-in-out infinite',
            willChange: 'transform, opacity',
          }} />
          <div className="absolute rounded-full" style={{
            width: 30, height: 30, bottom: 2, left: 12,
            background: 'radial-gradient(circle, rgba(52,211,153,0.4) 0%, transparent 70%)',
            filter: 'blur(10px)',
            animation: 'cl-glob 4.2s ease-in-out infinite reverse',
            willChange: 'transform, opacity',
          }} />
          <div className="absolute inset-0 flex items-center justify-center" style={{ animation: 'cl-float 2.5s ease-in-out infinite' }}>
            <div className="w-9 h-9 rounded-lg bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <p className="text-text-dim text-sm">{message}</p>
      </div>
    </div>
  )
}
