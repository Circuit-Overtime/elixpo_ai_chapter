"use client"

import { useEffect } from 'react'
import useUIStore from '../../store/useUIStore'

/** Keep the workspace entry point visible while the supported MCP-backed
 * LixScript workflow is being prepared. No parser execution is exposed. */
export default function LixScriptModal() {
  const open = useUIStore((state) => state.aiModalOpen)
  const toggle = useUIStore((state) => state.toggleAIModal)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') toggle()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, toggle])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 backdrop-blur-sm font-[lixFont]"
      onClick={toggle}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lixscript-coming-soon-title"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative w-[520px] max-w-[94vw] bg-surface border border-border-light rounded-2xl px-8 py-10 shadow-2xl text-center"
      >
        <button
          onClick={toggle}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          title="Close (Esc)"
        >
          <i className="bx bx-x text-lg" />
        </button>

        <div className="mx-auto mb-5 w-12 h-12 rounded-xl bg-accent-blue/10 border border-accent-blue/25 flex items-center justify-center">
          <i className="bx bx-plug text-2xl text-accent-blue" />
        </div>
        <span className="inline-flex px-2.5 py-1 rounded-full bg-accent-blue/10 text-accent-blue text-[10px] font-semibold uppercase tracking-wider">
          Coming soon
        </span>
        <h2 id="lixscript-coming-soon-title" className="mt-4 text-text-primary text-xl font-medium">LixScript MCP</h2>
        <p className="mt-2 text-text-muted text-sm leading-relaxed">
          LixScript is being prepared as the programmable MCP interface for LixSketch. This workspace panel will become available with the supported platform integration.
        </p>
      </div>
    </div>
  )
}
