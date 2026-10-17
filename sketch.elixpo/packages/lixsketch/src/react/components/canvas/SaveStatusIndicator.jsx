'use client'

import useUIStore from '../../store/useUIStore'

const STATUS_CONFIG = {
  cloud: { color: 'bg-green-400', label: 'Synced to cloud' },
  local: { color: 'bg-yellow-400', label: 'Saved locally' },
  failed: { color: 'bg-red-400', label: 'Sync failed' },
}

export default function SaveStatusIndicator() {
  const saveStatus = useUIStore((s) => s.saveStatus)

  if (saveStatus === 'idle') return null

  const config = STATUS_CONFIG[saveStatus]
  if (!config) return null

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-card/80 backdrop-blur-md border border-border-light font-[lixFont] pointer-events-none select-none">
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${config.color}`}
      />
      <span className="text-text-dim text-[10px] tracking-wide">
        {config.label}
      </span>
    </div>
  )
}
